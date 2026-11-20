import { browser, type Browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { storage } from 'wxt/utils/storage';
import { translate, type MessageKey, type Params } from '../lib/i18n';
import { DownloadEngine, type DownloadState } from '../lib/jobs/engine';
import type { Job } from '../lib/jobs/types';
import { computeStats } from '../lib/jobs/plan';
import { LogBook, type LogEntry } from '../lib/log';
import {
  LIVE_PORT,
  type BackgroundApi,
  type BackgroundRequest,
  type LiveEvent,
  type OffscreenReport,
  type Reply,
  type TabMessage,
} from '../lib/messages';
import { SiteLimiter } from '../lib/net/limiter';
import { PawchiveClient } from '../lib/pawchive/client';
import { AppBridge, BridgeError, EMPTY_BRIDGE, type BridgeState } from '../lib/bridge';
import { favoriteKey, parseFavorites, type Favorite } from '../lib/favorites';
import { createBackup, parseBackup, planRestore } from '../lib/backup';
import { SITE_PAGE_MATCHES, SITES, SITE_IDS } from '../lib/pawchive/sites';
import { parsePageUrl } from '../lib/pawchive/urls';
import {
  AUTO_RETRY_LIMIT,
  DEFAULT_SETTINGS,
  resolveLocale,
  type Locale,
  type Settings,
} from '../lib/settings';
import * as db from '../lib/storage/db';
import { loadSettings, saveSettings, watchSettings } from '../lib/storage/settings-store';
import {
  applyCheck,
  createWatchEntry,
  markSeen,
  totalNew,
  watchKey,
  type WatchEntry,
} from '../lib/watch';
import { localZipPort, offscreenZipPort, textObjectUrl } from '../lib/zip/hosts';

const IS_FIREFOX = import.meta.env.BROWSER === 'firefox';
const WATCH_ALARM = 'watch-check';
const RETRY_ALARM = 'auto-retry';
/** A media server that did not answer is skipped for this long. */
const MEDIA_DOWN_MS = 10 * 60_000;
const SITE_DOMAINS = SITE_IDS.flatMap((s) => SITES[s].domains);
const POST_LINKS = SITE_DOMAINS.flatMap((d) => [
  `https://${d}/*/user/*/post/*`,
  `https://www.${d}/*/user/*/post/*`,
]);
const CREATOR_LINKS = SITE_DOMAINS.flatMap((d) => [
  `https://${d}/*/user/*`,
  `https://www.${d}/*/user/*`,
]);

const jobsItem = storage.defineItem<Job[]>('local:jobs', { fallback: [] });
const watchItem = storage.defineItem<WatchEntry[]>('local:watchlist', { fallback: [] });
const logsItem = storage.defineItem<LogEntry[]>('local:logs', { fallback: [] });
const bridgeItem = storage.defineItem<BridgeState>('local:bridge', { fallback: EMPTY_BRIDGE });
const favoritesItem = storage.defineItem<Favorite[]>('local:favorites', { fallback: [] });
/** Posts opened before, newest first (read markers). */
const readsItem = storage.defineItem<string[]>('local:reads', { fallback: [] });
const MAX_READS = 20_000;

export default defineBackground({
  type: 'module',
  main() {
    let settings: Settings = { ...DEFAULT_SETTINGS };
    const logbook = new LogBook(2000, settings.logLevel);
    const log = logbook.logger('background');
    const limiter = new SiteLimiter({ maxActive: 5, minIntervalMs: settings.requestIntervalMs });
    const client = new PawchiveClient({
      limiter,
      onRetry: ({ url, attempt, delayMs, reason }) =>
        log.info(
          `Retrying ${new URL(url).pathname} (${reason}, attempt ${attempt}) in ${Math.round(delayMs / 1000)} s`,
        ),
    });
    const ports = new Set<Browser.runtime.Port>();
    const offscreen = IS_FIREFOX ? null : offscreenZipPort(limiter);

    const locale = (): Locale => resolveLocale(settings.language, browser.i18n.getUILanguage());
    const t = (key: MessageKey, params?: Params) => translate(locale(), key, params);

    // ------------------------------------------------------------- live UI

    let broadcastQueued = false;
    function broadcast(event: LiveEvent): void {
      for (const port of ports) {
        try {
          port.postMessage(event);
        } catch {
          ports.delete(port);
        }
      }
    }
    function scheduleJobsBroadcast(): void {
      if (broadcastQueued) return;
      broadcastQueued = true;
      setTimeout(() => {
        broadcastQueued = false;
        broadcast({ type: 'jobs', jobs: engine.list() });
        void updateBadge();
        updateHeartbeat();
      }, 200);
    }

    logbook.subscribe((entry) => {
      broadcast({ type: 'log', entry });
      scheduleLogSave();
    });
    let logSave: ReturnType<typeof setTimeout> | null = null;
    function scheduleLogSave(): void {
      logSave ??= setTimeout(() => {
        logSave = null;
        void logsItem.setValue(logbook.list().slice(-500));
      }, 3000);
    }

    // -------------------------------------------------------------- engine

    // The desktop app, when it runs and was paired (see lib/bridge.ts).
    const bridge = new AppBridge({
      fetch: (input, init) => fetch(input, init),
      load: async () => ({ ...EMPTY_BRIDGE, ...(await bridgeItem.getValue()) }),
      save: (state) => bridgeItem.setValue(state),
    });

    /** Runs a bridge call, turning "app closed" and similar into a result. */
    async function viaBridge<T extends object>(
      run: () => Promise<T>,
    ): Promise<({ ok: true } & T) | { ok: false; code: string }> {
      try {
        return { ok: true, ...(await run()) };
      } catch (error) {
        if (error instanceof BridgeError) return { ok: false, code: error.code };
        return { ok: false, code: 'network' };
      }
    }

    const engine = new DownloadEngine({
      client,
      limiter,
      settings: () => settings,
      log: logbook.logger('engine'),
      zip: offscreen ?? localZipPort(limiter),
      textUrl: textObjectUrl,
      downloads: {
        async start({ url, filename, conflictAction }) {
          return browser.downloads.download({
            url,
            filename,
            conflictAction: conflictAction === 'prompt' ? 'uniquify' : conflictAction,
            saveAs: conflictAction === 'prompt',
          });
        },
        async cancel(id) {
          await browser.downloads.cancel(id);
        },
        async erase(id) {
          await browser.downloads.erase({ id });
        },
        async get(id) {
          const [item] = await browser.downloads.search({ id });
          if (!item) return null;
          return {
            id,
            state: item.state as DownloadState,
            bytesReceived: item.bytesReceived ?? 0,
            totalBytes: item.totalBytes ?? 0,
            error: item.error ?? undefined,
          };
        },
      },
      store: { load: () => jobsItem.getValue(), save: (jobs) => jobsItem.setValue(jobs) },
      history: {
        knownHashes: (hashes) => db.knownHashes(hashes),
        record: (files, posts) => db.recordDownloads(files, posts),
        add: (entry) => db.addHistory(entry),
      },
      onChange: scheduleJobsBroadcast,
      onJobFinished: (job) => notifyJob(job),
    });

    browser.downloads.onChanged.addListener((delta) => {
      engine.onDownloadChanged(
        delta.id,
        delta.state?.current as DownloadState | undefined,
        delta.error?.current,
      );
    });

    // Keep the worker alive and progress fresh while something downloads.
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    function updateHeartbeat(): void {
      if (engine.busy && !heartbeat) {
        heartbeat = setInterval(() => {
          void engine.refreshProgress();
          void browser.runtime.getPlatformInfo();
        }, 1000);
      } else if (!engine.busy && heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    }

    // --------------------------------------------------------------- badge

    async function updateBadge(): Promise<void> {
      const running = engine.activeCount;
      if (running > 0) {
        await browser.action.setBadgeBackgroundColor({ color: settings.accent });
        await browser.action.setBadgeText({ text: String(running) });
        return;
      }
      const fresh = totalNew(await watchItem.getValue());
      await browser.action.setBadgeBackgroundColor({ color: '#3ccf91' });
      await browser.action.setBadgeText({
        text: fresh > 0 ? (fresh > 99 ? '99+' : String(fresh)) : '',
      });
    }

    // ------------------------------------------------------- notifications

    async function notify(id: string, title: string, message: string): Promise<void> {
      try {
        await browser.notifications.create(id, {
          type: 'basic',
          iconUrl: browser.runtime.getURL('/icon/128.png'),
          title,
          message,
        });
      } catch (error) {
        log.debug('Notification failed', error);
      }
    }

    function notifyJob(job: Job): void {
      const stats = computeStats(job.items);
      if (settings.notifications === 'none') return;
      const failed = job.status === 'failed' || stats.failed > 0;
      if (settings.notifications === 'errors' && !failed) return;
      if (job.status === 'cancelled') return;
      // Private notifications never show post titles or creator names.
      const name = settings.privateNotifications ? t('notify.aDownload') : job.title;
      const title =
        job.status === 'failed'
          ? t('notify.jobFailed', { title: name })
          : t('notify.jobDone', { title: name });
      const message =
        job.error === 'nothing-found'
          ? t('error.nothingFound')
          : stats.failed > 0
            ? t('notify.jobPartial', { count: stats.failed, done: stats.done })
            : t('notify.jobDoneBody', { count: stats.done });
      void notify(`job:${job.id}`, title, message);
    }

    browser.notifications.onClicked.addListener((id) => {
      void openDashboard(id.startsWith('watch') ? 'watchlist' : 'downloads');
      void browser.notifications.clear(id);
    });

    async function openDashboard(tab = 'downloads'): Promise<void> {
      const url = browser.runtime.getURL(`/options.html#${tab}`);
      const [existing] = await browser.tabs.query({ url: browser.runtime.getURL('/options.html') });
      if (existing?.id !== undefined) {
        await browser.tabs.update(existing.id, { active: true, url });
        if (existing.windowId !== undefined)
          await browser.windows.update(existing.windowId, { focused: true });
      } else {
        await browser.tabs.create({ url });
      }
    }

    // ----------------------------------------------------------- watchlist

    let checking: Promise<number> | null = null;
    async function checkWatchlist(onlyKey?: string): Promise<number> {
      if (checking) return checking;
      checking = (async () => {
        const entries = await watchItem.getValue();
        let found = 0;
        const fresh: string[] = [];
        for (let i = 0; i < entries.length; i++) {
          let entry = entries[i] as WatchEntry;
          if (onlyKey && entry.key !== onlyKey) continue;
          try {
            const page = await client.getCreatorPage(entry.service, entry.creatorId, 0);
            const result = applyCheck(entry, page);
            entry = result.entry;
            if (result.found.length) {
              found += result.found.length;
              fresh.push(entry.name);
              log.info(`${result.found.length} new posts from ${entry.name}`);
              if (entry.autoDownload) {
                await engine.create({
                  kind: 'creator',
                  service: entry.service,
                  creatorId: entry.creatorId,
                  postIds: result.found.map((p) => p.id),
                });
                entry = markSeen(
                  entry,
                  result.found.map((p) => p.id),
                );
              }
            }
          } catch (error) {
            entry = {
              ...entry,
              lastCheckedAt: Date.now(),
              error: error instanceof Error ? error.message : String(error),
            };
            log.warn(`Could not check ${entry.name}`, error);
          }
          entries[i] = entry;
        }
        await watchItem.setValue(entries);
        if (found > 0 && settings.notifications === 'all') {
          void notify(
            `watch:${Date.now()}`,
            t('notify.newPosts', { count: found }),
            settings.privateNotifications ? '' : fresh.slice(0, 5).join(', '),
          );
        }
        broadcast({ type: 'watch', newCount: totalNew(entries) });
        void updateBadge();
        return found;
      })().finally(() => {
        checking = null;
      });
      return checking;
    }

    async function updateWatch(
      key: string,
      change: (entry: WatchEntry) => WatchEntry | null,
    ): Promise<void> {
      const entries = await watchItem.getValue();
      const next = entries.flatMap((e) =>
        e.key === key ? [change(e)].filter((x): x is WatchEntry => x !== null) : [e],
      );
      await watchItem.setValue(next);
      broadcast({ type: 'watch', newCount: totalNew(next) });
      void updateBadge();
    }

    async function addWatch(service: string, creatorId: string, name: string): Promise<WatchEntry> {
      const entries = await watchItem.getValue();
      const key = watchKey(service, creatorId);
      const existing = entries.find((e) => e.key === key);
      if (existing) return existing;
      const entry = createWatchEntry(service, creatorId, name);
      await watchItem.setValue([...entries, entry]);
      log.info(`Watching ${name}`);
      // Take a baseline right away so the next check can find new posts.
      void checkWatchlist(key);
      return entry;
    }

    function scheduleWatchAlarm(): void {
      void browser.alarms.clear(WATCH_ALARM).then(() => {
        if (settings.watchIntervalMinutes > 0) {
          void browser.alarms.create(WATCH_ALARM, {
            periodInMinutes: settings.watchIntervalMinutes,
            delayInMinutes: 1,
          });
        }
      });
    }

    // Failed files go back in the queue by themselves after a while (the
    // check runs every minute; the setting decides how long they wait).
    void browser.alarms.create(RETRY_ALARM, { periodInMinutes: 1, delayInMinutes: 1 });

    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === WATCH_ALARM) void checkWatchlist();
      if (alarm.name === RETRY_ALARM && settings.autoRetryMinutes > 0) {
        engine.autoRetry(settings.autoRetryMinutes * 60_000, AUTO_RETRY_LIMIT);
      }
    });

    /** How the app lists this pairing: browser and extension name. */
    function extensionName(): string {
      const browserName = IS_FIREFOX
        ? 'Firefox'
        : /Edg\//.test(navigator.userAgent)
          ? 'Edge'
          : 'Chrome';
      return `${browserName}: ${browser.runtime.getManifest().name}`;
    }

    // ------------------------------------------------------- media servers

    const mediaDown = new Map<string, number>();

    /**
     * Whether the media server behind a file URL answers, with one tiny
     * request (the first byte), as the desktop app checks before a download.
     */
    async function checkMedia(url: string): Promise<{ reachable: boolean; host: string }> {
      let host = '';
      try {
        host = new URL(url).hostname;
      } catch {
        return { reachable: true, host };
      }
      const until = mediaDown.get(host);
      if (until !== undefined && until > Date.now()) return { reachable: false, host };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: controller.signal });
        mediaDown.delete(host);
        return { reachable: true, host };
      } catch {
        // No answer at all (timeout or refused): the server is down. Any
        // answer, even an error status, means it is up.
        mediaDown.set(host, Date.now() + MEDIA_DOWN_MS);
        log.warn(`The media server ${host} does not answer`);
        return { reachable: false, host };
      } finally {
        clearTimeout(timer);
      }
    }

    // -------------------------------------------------------- context menu

    async function buildMenus(): Promise<void> {
      await browser.contextMenus.removeAll();
      const create = (props: Browser.contextMenus.CreateProperties) =>
        browser.contextMenus.create(props, () => void browser.runtime.lastError);
      create({
        id: 'download-post-link',
        title: t('menu.downloadPost'),
        contexts: ['link'],
        targetUrlPatterns: POST_LINKS,
      });
      create({
        id: 'download-creator-link',
        title: t('menu.downloadCreator'),
        contexts: ['link'],
        targetUrlPatterns: CREATOR_LINKS,
      });
      create({
        id: 'watch-creator-link',
        title: t('menu.watchCreator'),
        contexts: ['link'],
        targetUrlPatterns: CREATOR_LINKS,
      });
      create({
        id: 'open-panel',
        title: t('menu.openPanel'),
        contexts: ['page'],
        documentUrlPatterns: [...SITE_PAGE_MATCHES],
      });
    }

    browser.contextMenus.onClicked.addListener((info, tab) => {
      void (async () => {
        const target = parsePageUrl(info.linkUrl ?? '');
        if (info.menuItemId === 'open-panel' && tab?.id !== undefined) {
          await sendToTab(tab.id, { type: 'panel:open' });
          return;
        }
        if (target.kind === 'post' && info.menuItemId === 'download-post-link') {
          await engine.create({
            kind: 'refs',
            refs: [{ service: target.service, creatorId: target.creatorId, postId: target.postId }],
          });
          return;
        }
        if (target.kind !== 'creator') return;
        if (info.menuItemId === 'download-creator-link') {
          await engine.create({
            kind: 'creator',
            service: target.service,
            creatorId: target.creatorId,
          });
        } else if (info.menuItemId === 'watch-creator-link') {
          const creator = await client
            .getCreator(target.service, target.creatorId)
            .catch(() => null);
          await addWatch(target.service, target.creatorId, creator?.name ?? target.creatorId);
        }
      })().catch((error) => log.error('Context menu action failed', error));
    });

    async function sendToTab(tabId: number, message: TabMessage): Promise<void> {
      await browser.tabs
        .sendMessage(tabId, message)
        .catch((error) => log.debug('Tab did not answer', error));
    }

    browser.commands.onCommand.addListener((command) => {
      void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab?.id === undefined) return;
        if (command === 'toggle-panel') void sendToTab(tab.id, { type: 'panel:toggle' });
        if (command === 'download-page') void sendToTab(tab.id, { type: 'panel:quick-download' });
      });
    });

    // ------------------------------------------------------------- routing

    type Handler<K extends keyof BackgroundApi> = (
      req: BackgroundApi[K]['req'],
    ) => Promise<BackgroundApi[K]['res']>;
    const handlers: { [K in keyof BackgroundApi]: Handler<K> } = {
      'jobs:create': async ({ request }) => ({ jobId: await engine.create(request) }),
      'jobs:action': async ({ jobId, action }) => {
        await engine.act(jobId, action);
        return null;
      },
      'jobs:all': async ({ action }) => {
        await engine.actAll(action);
        return null;
      },
      'jobs:clear-finished': async () => {
        engine.clearFinished();
        return null;
      },
      'jobs:list': async () => engine.list(),
      'jobs:detail': async ({ jobId }) => engine.get(jobId) ?? null,
      'history:list': () => db.listHistory(),
      'history:remove': async ({ ids }) => {
        await db.removeHistory(ids);
        return null;
      },
      'history:clear': async ({ forgetFiles }) => {
        await db.clearHistory(forgetFiles);
        log.info(forgetFiles ? 'History and downloaded-file records cleared' : 'History cleared');
        return null;
      },
      'history:known-hashes': async ({ hashes }) => [...(await db.knownHashes(hashes))],
      'history:known-posts': async ({ keys }) => [...(await db.knownPosts(keys))],
      'history:stats': () => db.countKnown(),
      'history:requeue': async ({ id }) => {
        const entry = (await db.listHistory()).find((h) => h.id === id);
        if (!entry || entry.refs.length === 0) return null;
        const jobId = await engine.create({
          kind: 'refs',
          title: entry.title,
          creator: entry.creator,
          refs: entry.refs,
          options: { mode: entry.mode, skipDownloaded: false },
        });
        return { jobId };
      },
      'watch:list': () => watchItem.getValue(),
      'watch:add': ({ service, creatorId, name }) => addWatch(service, creatorId, name),
      'watch:remove': async ({ key }) => {
        await updateWatch(key, () => null);
        return null;
      },
      'watch:update': async ({ key, patch }) => {
        await updateWatch(key, (e) => ({ ...e, ...patch }));
        return null;
      },
      'watch:check': async ({ key }) => ({ found: await checkWatchlist(key) }),
      'watch:download-new': async ({ key }) => {
        const entry = (await watchItem.getValue()).find((e) => e.key === key);
        if (!entry || entry.newPosts.length === 0) return null;
        const jobId = await engine.create({
          kind: 'creator',
          service: entry.service,
          creatorId: entry.creatorId,
          postIds: entry.newPosts.map((p) => p.id),
        });
        await updateWatch(key, (e) => markSeen(e));
        return { jobId };
      },
      'watch:mark-seen': async ({ key, ids }) => {
        const entries = await watchItem.getValue();
        for (const entry of entries)
          if (!key || entry.key === key) await updateWatch(entry.key, (e) => markSeen(e, ids));
        return null;
      },
      'watch:import': async ({ lines }) => {
        let added = 0;
        const existing = new Set((await watchItem.getValue()).map((e) => e.key));
        for (const line of lines) {
          const ref = parsePageUrl(line.trim());
          if (ref.kind !== 'creator' && ref.kind !== 'post') continue;
          if (existing.has(watchKey(ref.service, ref.creatorId))) continue;
          const creator = await client.getCreator(ref.service, ref.creatorId).catch(() => null);
          await addWatch(ref.service, ref.creatorId, creator?.name ?? ref.creatorId);
          existing.add(watchKey(ref.service, ref.creatorId));
          added += 1;
        }
        return { added };
      },
      'media:check': async ({ url }) => checkMedia(url),
      'reads:mark': async ({ key }) => {
        const reads = await readsItem.getValue();
        if (reads[0] !== key) {
          await readsItem.setValue([key, ...reads.filter((k) => k !== key)].slice(0, MAX_READS));
        }
        return null;
      },
      'favorites:list': async () => favoritesItem.getValue(),
      'backup:create': async () =>
        createBackup({
          settings: await loadSettings(),
          watchlist: await watchItem.getValue(),
          favorites: await favoritesItem.getValue(),
          history: await db.listHistory(),
          reads: await readsItem.getValue(),
        }),
      'backup:restore': async ({ text }) => {
        const backup = parseBackup(text);
        if (!backup) return { ok: false };
        const plan = planRestore(backup, {
          settings: await loadSettings(),
          watchlist: await watchItem.getValue(),
          favorites: await favoritesItem.getValue(),
          history: await db.listHistory(),
          reads: await readsItem.getValue(),
        });
        await saveSettings(plan.settings);
        await watchItem.setValue(plan.watchlist);
        await favoritesItem.setValue(plan.favorites);
        for (const entry of plan.newHistory) await db.addHistory(entry);
        await readsItem.setValue(plan.reads);
        scheduleWatchAlarm();
        void updateBadge();
        log.info(
          `Restored a backup: ${plan.report.watch} watched creators, ${plan.report.favorites} favorites, ${plan.report.history} downloads`,
        );
        return { ok: true, ...plan.report };
      },
      'favorites:toggle': async ({ favorite }) => {
        const list = await favoritesItem.getValue();
        const key = favoriteKey(
          favorite.kind,
          favorite.service,
          favorite.creatorId,
          favorite.postId,
        );
        if (list.some((f) => f.key === key)) {
          await favoritesItem.setValue(list.filter((f) => f.key !== key));
          return { favorite: false };
        }
        await favoritesItem.setValue([
          { ...favorite, key, note: '', addedAt: Date.now() },
          ...list,
        ]);
        return { favorite: true };
      },
      'favorites:remove': async ({ keys }) => {
        const drop = new Set(keys);
        await favoritesItem.setValue(
          (await favoritesItem.getValue()).filter((f) => !drop.has(f.key)),
        );
        return null;
      },
      'favorites:update': async ({ key, title, note }) => {
        const list = await favoritesItem.getValue();
        await favoritesItem.setValue(
          list.map((f) =>
            f.key === key
              ? {
                  ...f,
                  ...(title !== undefined ? { title } : {}),
                  ...(note !== undefined ? { note } : {}),
                }
              : f,
          ),
        );
        return null;
      },
      'favorites:import': async ({ text }) => {
        const list = await favoritesItem.getValue();
        const have = new Set(list.map((f) => f.key));
        const fresh = parseFavorites(text).filter((f) => !have.has(f.key));
        await favoritesItem.setValue([...fresh, ...list]);
        return { added: fresh.length };
      },
      'reads:known': async ({ keys }) => {
        const reads = new Set(await readsItem.getValue());
        return keys.filter((k) => reads.has(k));
      },
      'bridge:status': async () => ({
        ...(await bridge.status()),
        pairedAt: (await bridgeItem.getValue()).pairedAt ?? null,
      }),
      'bridge:pair': async ({ code }) =>
        viaBridge(async () => {
          const status = await bridge.pair(code, extensionName());
          log.info(`Paired with Pawchive Downloader ${status.version ?? ''}`.trim());
          return status;
        }),
      'bridge:unpair': async () => {
        await bridge.unpair();
        log.info('Unpaired from the desktop app');
        return null;
      },
      'bridge:send': async ({ request }) =>
        viaBridge(async () => {
          const result = await bridge.send(request);
          const label =
            request.kind === 'creator' ? request.creatorId : (request.title ?? request.kind);
          log.info(`Sent "${label}" to the desktop app`);
          return result;
        }),
      'bridge:jobs': async () => bridge.jobs().catch(() => []),
      'bridge:action': async ({ jobId, action }) => {
        await bridge.act(jobId, action);
        return null;
      },
      'bridge:watch': async ({ service, creatorId, name }) =>
        viaBridge(async () => ({ added: await bridge.watch(service, creatorId, name) })),
      'logs:list': async () => logbook.list(),
      'logs:clear': async () => {
        logbook.clear();
        await logsItem.setValue([]);
        return null;
      },
      'app:open-dashboard': async ({ tab }) => {
        await openDashboard(tab);
        return null;
      },
      'app:show-file': async ({ path }) => {
        const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\//g, '[\\\\/]');
        const [match] = await browser.downloads.search({
          filenameRegex: `${escaped}$`,
          exists: true,
          limit: 1,
          orderBy: ['-startTime'],
        });
        if (match?.id === undefined) return false;
        browser.downloads.show(match.id);
        return true;
      },
      'app:open-downloads-folder': async () => {
        browser.downloads.showDefaultFolder();
        return null;
      },
    };

    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      const msg = message as BackgroundRequest | OffscreenReport | { target?: string };
      if ('target' in msg && msg.target === 'offscreen') return false;
      if (offscreen && typeof msg === 'object' && msg && 'runId' in msg) {
        const answer = offscreen.handle(msg as OffscreenReport);
        if (!answer) return false;
        void answer.then(sendResponse);
        return true;
      }
      const request = msg as BackgroundRequest;
      const handler = handlers[request.type as keyof BackgroundApi] as
        Handler<keyof BackgroundApi> | undefined;
      if (!handler) return false;
      void ready
        .then(() => handler(request as never))
        .then(
          (data) => sendResponse({ ok: true, data } satisfies Reply<unknown>),
          (error: unknown) => {
            log.error(`Request ${request.type} failed`, error);
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            } satisfies Reply<unknown>);
          },
        );
      return true;
    });

    browser.runtime.onConnect.addListener((port) => {
      if (port.name !== LIVE_PORT) return;
      ports.add(port);
      port.onDisconnect.addListener(() => ports.delete(port));
      void ready.then(async () => {
        port.postMessage({ type: 'jobs', jobs: engine.list() } satisfies LiveEvent);
        port.postMessage({
          type: 'watch',
          newCount: totalNew(await watchItem.getValue()),
        } satisfies LiveEvent);
      });
    });

    browser.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') void openDashboard('about');
    });

    // ------------------------------------------------------------- startup

    function applySettings(next: Settings): void {
      const languageChanged = next.language !== settings.language;
      settings = next;
      logbook.level = next.logLevel;
      limiter.configure({ minIntervalMs: next.requestIntervalMs });
      if (languageChanged) void buildMenus();
      scheduleWatchAlarm();
      engine.pump();
    }

    const ready = (async () => {
      settings = await loadSettings();
      logbook.level = settings.logLevel;
      limiter.configure({ minIntervalMs: settings.requestIntervalMs });
      logbook.restore(await logsItem.getValue());
      watchSettings(applySettings);
      await buildMenus();
      scheduleWatchAlarm();
      await engine.init();
      void updateBadge();
      updateHeartbeat();
      log.debug('Background ready');
    })().catch((error) => log.error('Startup failed', error));
  },
});
