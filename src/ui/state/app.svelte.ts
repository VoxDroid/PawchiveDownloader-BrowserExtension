import { browser, type Browser } from 'wxt/browser';
import {
  BCP47,
  formatBytes as fmtBytes,
  formatDate as fmtDate,
  formatDuration as fmtDuration,
  formatNumber as fmtNumber,
  formatRelative as fmtRelative,
  translate,
  type MessageKey,
  type Params,
} from '../../lib/i18n';
import type { JobSummary } from '../../lib/jobs/types';
import { LIVE_PORT, type LiveEvent } from '../../lib/messages';
import type { LogEntry } from '../../lib/log';
import { DEFAULT_SETTINGS, resolveLocale, type Locale, type Settings } from '../../lib/settings';
import { loadSettings, saveSettings, watchSettings } from '../../lib/storage/settings-store';

/**
 * Shared reactive state for every UI surface: settings (synced with storage),
 * the active locale, and the live job list pushed by the background.
 */
export const app = $state({
  settings: { ...DEFAULT_SETTINGS } as Settings,
  locale: 'en' as Locale,
  ready: false,
  jobs: [] as JobSummary[],
  watchNew: 0,
  connected: false,
  systemDark: true,
});

const logListeners = new Set<(entry: LogEntry) => void>();

function uiLanguage(): string {
  try {
    return browser.i18n.getUILanguage();
  } catch {
    return navigator.language;
  }
}

function applySettings(settings: Settings): void {
  app.settings = settings;
  app.locale = resolveLocale(settings.language, uiLanguage());
}

let started: Promise<void> | null = null;

export function startApp(options: { live?: boolean } = {}): Promise<void> {
  started ??= (async () => {
    applySettings(await loadSettings());
    watchSettings(applySettings);
    const media = matchMedia('(prefers-color-scheme: dark)');
    app.systemDark = media.matches;
    media.addEventListener('change', (e) => (app.systemDark = e.matches));
    app.ready = true;
    if (options.live !== false) connectLive();
  })();
  return started;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  applySettings({ ...app.settings, ...patch });
  applySettings(await saveSettings(patch));
}

/** Translation bound to the current UI language; reactive in templates. */
export function t(key: MessageKey | (string & {}), params?: Params): string {
  return translate(app.locale, key, params);
}

export const fmt = {
  bytes: (n: number) => fmtBytes(n, app.locale),
  number: (n: number) => fmtNumber(n, app.locale),
  duration: (ms: number) => fmtDuration(ms, app.locale),
  relative: (at: number) => fmtRelative(at, app.locale),
  date: (value: string | number | null, withTime = false) => fmtDate(value, app.locale, withTime),
};

// ------------------------------------------------------------------ theme

export function themeAttributes(): { theme: string; motion: string; style: string } {
  const s = app.settings;
  const theme = s.theme === 'system' ? (app.systemDark ? 'midnight' : 'light') : s.theme;
  const reduce =
    s.reduceMotion === 'on' ||
    (s.reduceMotion === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  return { theme, motion: reduce ? 'reduced' : 'full', style: `--accent:${s.accent}` };
}

/** Keeps an element's theme attributes in sync with settings. */
export function themed(node: HTMLElement): void {
  $effect(() => {
    const attrs = themeAttributes();
    node.dataset.theme = attrs.theme;
    node.dataset.motion = attrs.motion;
    node.style.setProperty('--accent', app.settings.accent);
  });
}

/** For extension pages: themes <html> and #app, and sets the page language. */
export function themeDocument(): void {
  $effect(() => {
    const attrs = themeAttributes();
    for (const el of [document.documentElement, document.getElementById('app')]) {
      if (!el) continue;
      el.dataset.theme = attrs.theme;
      el.dataset.motion = attrs.motion;
      el.style.setProperty('--accent', app.settings.accent);
    }
    document.documentElement.lang = BCP47[app.locale];
  });
}

// ------------------------------------------------------------------- live

let port: Browser.runtime.Port | null = null;
let retry = 0;

function connectLive(): void {
  try {
    port = browser.runtime.connect({ name: LIVE_PORT });
  } catch {
    scheduleReconnect();
    return;
  }
  app.connected = true;
  port.onMessage.addListener((message: unknown) => {
    retry = 0;
    const event = message as LiveEvent;
    if (event.type === 'jobs') app.jobs = event.jobs;
    else if (event.type === 'watch') app.watchNew = event.newCount;
    else if (event.type === 'log') for (const listener of logListeners) listener(event.entry);
  });
  port.onDisconnect.addListener(() => {
    port = null;
    app.connected = false;
    scheduleReconnect();
  });
}

function scheduleReconnect(): void {
  // The background worker may have been stopped by the browser; reconnecting
  // wakes it up again. Back off if the extension itself went away.
  retry = Math.min(retry + 1, 6);
  setTimeout(
    () => {
      if (!browser.runtime?.id) return;
      connectLive();
    },
    250 * 2 ** retry,
  );
}

export function onLog(listener: (entry: LogEntry) => void): () => void {
  logListeners.add(listener);
  return () => logListeners.delete(listener);
}

// ------------------------------------------------------------------ jobs

export function overallProgress(jobs: readonly JobSummary[]): {
  active: number;
  ratio: number;
  speed: number;
} {
  const running = jobs.filter(
    (j) => j.status === 'running' || j.status === 'queued' || j.status === 'resolving',
  );
  let done = 0;
  let total = 0;
  let speed = 0;
  for (const job of running) {
    done += job.stats.done + job.stats.failed + job.stats.skipped + (job.stats.partial ?? 0);
    total += job.stats.total;
    speed += job.speed;
  }
  return { active: running.length, ratio: total ? done / total : 0, speed };
}
