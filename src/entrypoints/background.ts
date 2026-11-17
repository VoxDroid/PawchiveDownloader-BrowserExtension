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
import { parsePageUrl, SITE_ORIGIN } from '../lib/pawchive/urls';
import { DEFAULT_SETTINGS, resolveLocale, type Locale, type Settings } from '../lib/settings';
import * as db from '../lib/storage/db';
import { loadSettings, watchSettings } from '../lib/storage/settings-store';
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
const POST_LINK = `${SITE_ORIGIN}/*/user/*/post/*`;
const CREATOR_LINK = `${SITE_ORIGIN}/*/user/*`;

const jobsItem = storage.defineItem<Job[]>('local:jobs', { fallback: [] });
const watchItem = storage.defineItem<WatchEntry[]>('local:watchlist', { fallback: [] });
const logsItem = storage.defineItem<LogEntry[]>('local:logs', { fallback: [] });

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
      const title =
        job.status === 'failed'
          ? t('notify.jobFailed', { title: job.title })
          : t('notify.jobDone', { title: job.title });
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
            fresh.slice(0, 5).join(', '),
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

    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === WATCH_ALARM) void checkWatchlist();
    });

    // -------------------------------------------------------- context menu

    async function buildMenus(): Promise<void> {
      await browser.contextMenus.removeAll();
      const create = (props: Browser.contextMenus.CreateProperties) =>
        browser.contextMenus.create(props, () => void browser.runtime.lastError);
      create({
        id: 'download-post-link',
        title: t('menu.downloadPost'),
        contexts: ['link'],
        targetUrlPatterns: [POST_LINK],
      });
      create({
        id: 'download-creator-link',
        title: t('menu.downloadCreator'),
        contexts: ['link'],
        targetUrlPatterns: [CREATOR_LINK],
      });
      create({
        id: 'watch-creator-link',
        title: t('menu.watchCreator'),
        contexts: ['link'],
        targetUrlPatterns: [CREATOR_LINK],
      });
      create({
        id: 'open-panel',
        title: t('menu.openPanel'),
        contexts: ['page'],
        documentUrlPatterns: [`${SITE_ORIGIN}/*`],
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
