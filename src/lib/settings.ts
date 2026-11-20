import { FILE_CATEGORIES } from './pawchive/normalize';
import type { FileCategory } from './pawchive/types';
import {
  DEFAULT_ARCHIVE_TEMPLATE,
  DEFAULT_FILE_TEMPLATE,
  DEFAULT_FOLDER_TEMPLATE,
  OLD_DEFAULT_FOLDER_TEMPLATE,
  validateTemplate,
} from './download/template';

export const LOCALES = ['en', 'ja', 'ko', 'zh_CN', 'es', 'pt_BR', 'ru', 'de', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];

export const THEMES = ['midnight', 'graphite', 'plum', 'forest', 'ember', 'light'] as const;
export type Theme = (typeof THEMES)[number];

export type DownloadMode = 'individual' | 'zip';
export type ConflictAction = 'uniquify' | 'overwrite' | 'prompt';
export type PreviewOnlyAction = 'relay' | 'thumbnail' | 'skip';
export type ContentFormat = 'none' | 'txt' | 'html' | 'both';
export type Corner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type NotificationLevel = 'all' | 'errors' | 'none';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Settings {
  // Appearance
  language: 'auto' | Locale;
  theme: Theme | 'system';
  accent: string;
  reduceMotion: 'auto' | 'on' | 'off';
  // Downloads
  downloadMode: DownloadMode;
  concurrency: number;
  requestIntervalMs: number;
  maxRetries: number;
  folderTemplate: string;
  fileTemplate: string;
  archiveTemplate: string;
  conflictAction: ConflictAction;
  skipDownloaded: boolean;
  previewOnly: PreviewOnlyAction;
  saveContent: ContentFormat;
  saveMetadata: boolean;
  /** Save `links.txt` with the post's outside links and archive passwords. */
  saveLinks: boolean;
  saveComments: boolean;
  /** Save the creator's announcements once per download. */
  saveAnnouncements: boolean;
  /** Save the thumbnail when a media server is down or the file is gone. */
  thumbnailFallback: boolean;
  /** Put failed files back in the queue after this many minutes (0 = off), up to three times. */
  autoRetryMinutes: number;
  categories: Record<FileCategory, boolean>;
  // ZIP
  zipMaxSizeMb: number;
  zipVideosSeparately: boolean;
  zipSeparateOverMb: number;
  // Page integration
  showFloatingButton: boolean;
  buttonCorner: Corner;
  panelSide: 'right' | 'left';
  cardSelectors: boolean;
  markDownloaded: boolean;
  /** Mark posts you opened before on the site's lists. */
  readMarkers: boolean;
  /** Keep thumbnails, avatars and banners blurred until pointed at. */
  blurPreviews: boolean;
  // Notifications & background
  notifications: NotificationLevel;
  /** Notifications without post titles or creator names. */
  privateNotifications: boolean;
  // Desktop app
  /** Send downloads to the paired desktop app when it runs. */
  sendToApp: boolean;
  watchIntervalMinutes: number;
  recordHistory: boolean;
  logLevel: LogLevel;
}

export const ACCENTS = ['#8b7cf6', '#5aa9ff', '#3ccf91', '#f5a524', '#ff6b8b', '#22d3ee'] as const;

export const WATCH_INTERVALS = [0, 60, 180, 360, 720, 1440] as const;

/** Minutes before failed files are tried again by themselves (0 = never). */
export const AUTO_RETRY_MINUTES = [0, 15, 30, 60, 120, 180] as const;
/** Automatic retries each failed file gets. */
export const AUTO_RETRY_LIMIT = 3;

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  language: 'auto',
  theme: 'midnight',
  accent: ACCENTS[0],
  reduceMotion: 'auto',
  downloadMode: 'individual',
  concurrency: 3,
  requestIntervalMs: 1000,
  maxRetries: 5,
  folderTemplate: DEFAULT_FOLDER_TEMPLATE,
  fileTemplate: DEFAULT_FILE_TEMPLATE,
  archiveTemplate: DEFAULT_ARCHIVE_TEMPLATE,
  conflictAction: 'uniquify',
  skipDownloaded: true,
  previewOnly: 'relay',
  saveContent: 'txt',
  saveMetadata: false,
  saveLinks: true,
  saveComments: false,
  saveAnnouncements: false,
  thumbnailFallback: true,
  autoRetryMinutes: 30,
  categories: Object.fromEntries(FILE_CATEGORIES.map((c) => [c, true])) as Record<
    FileCategory,
    boolean
  >,
  zipMaxSizeMb: 2048,
  zipVideosSeparately: true,
  zipSeparateOverMb: 300,
  showFloatingButton: true,
  buttonCorner: 'bottom-right',
  panelSide: 'right',
  cardSelectors: true,
  markDownloaded: true,
  readMarkers: true,
  blurPreviews: false,
  notifications: 'all',
  privateNotifications: false,
  sendToApp: false,
  watchIntervalMinutes: 360,
  recordHistory: true,
  logLevel: 'info',
} satisfies Settings);

/** Pawchive asks for at most five downloads at once. */
export const MAX_CONCURRENCY = 5;
/** ...and at most one new request a second. */
export const MIN_REQUEST_INTERVAL_MS = 1000;
/** fflate writes classic ZIP (no ZIP64), so one archive must stay under 4 GiB. */
export const ZIP_HARD_LIMIT_MB = 3900;

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function intIn(value: unknown, min: number, max: number, fallback: number): number {
  const n =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function template(value: unknown, kind: 'folder' | 'file', fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().slice(0, 300);
  return validateTemplate(trimmed, kind) === null ? trimmed : fallback;
}

/**
 * Builds valid settings from anything (stored data from an older version, an
 * imported file, a partial update). Unknown keys are dropped, bad values fall
 * back to their defaults.
 */
export function coerceSettings(input: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  const s = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const categories = { ...d.categories };
  if (s.categories && typeof s.categories === 'object') {
    for (const category of FILE_CATEGORIES) {
      const value = (s.categories as Record<string, unknown>)[category];
      if (typeof value === 'boolean') categories[category] = value;
    }
  }
  return {
    language: s.language === 'auto' ? 'auto' : oneOf(s.language, LOCALES, d.language as Locale),
    theme: s.theme === 'system' ? 'system' : oneOf(s.theme, THEMES, d.theme as Theme),
    accent:
      typeof s.accent === 'string' && /^#[0-9a-f]{6}$/i.test(s.accent)
        ? s.accent.toLowerCase()
        : d.accent,
    reduceMotion: oneOf(s.reduceMotion, ['auto', 'on', 'off'] as const, d.reduceMotion),
    downloadMode: oneOf(s.downloadMode, ['individual', 'zip'] as const, d.downloadMode),
    concurrency: intIn(s.concurrency, 1, MAX_CONCURRENCY, d.concurrency),
    requestIntervalMs: intIn(
      s.requestIntervalMs,
      MIN_REQUEST_INTERVAL_MS,
      10_000,
      d.requestIntervalMs,
    ),
    maxRetries: intIn(s.maxRetries, 0, 20, d.maxRetries),
    folderTemplate: ((value) => (value === OLD_DEFAULT_FOLDER_TEMPLATE ? d.folderTemplate : value))(
      template(s.folderTemplate, 'folder', d.folderTemplate),
    ),
    fileTemplate: template(s.fileTemplate, 'file', d.fileTemplate),
    archiveTemplate: template(s.archiveTemplate, 'file', d.archiveTemplate),
    conflictAction: oneOf(
      s.conflictAction,
      ['uniquify', 'overwrite', 'prompt'] as const,
      d.conflictAction,
    ),
    skipDownloaded: bool(s.skipDownloaded, d.skipDownloaded),
    previewOnly: oneOf(s.previewOnly, ['relay', 'thumbnail', 'skip'] as const, d.previewOnly),
    saveContent: oneOf(s.saveContent, ['none', 'txt', 'html', 'both'] as const, d.saveContent),
    saveMetadata: bool(s.saveMetadata, d.saveMetadata),
    saveLinks: bool(s.saveLinks, d.saveLinks),
    saveComments: bool(s.saveComments, d.saveComments),
    saveAnnouncements: bool(s.saveAnnouncements, d.saveAnnouncements),
    thumbnailFallback: bool(s.thumbnailFallback, d.thumbnailFallback),
    autoRetryMinutes: (AUTO_RETRY_MINUTES as readonly number[]).includes(Number(s.autoRetryMinutes))
      ? Number(s.autoRetryMinutes)
      : d.autoRetryMinutes,
    categories,
    zipMaxSizeMb: intIn(s.zipMaxSizeMb, 50, ZIP_HARD_LIMIT_MB, d.zipMaxSizeMb),
    zipVideosSeparately: bool(s.zipVideosSeparately, d.zipVideosSeparately),
    zipSeparateOverMb: intIn(s.zipSeparateOverMb, 10, ZIP_HARD_LIMIT_MB, d.zipSeparateOverMb),
    showFloatingButton: bool(s.showFloatingButton, d.showFloatingButton),
    buttonCorner: oneOf(
      s.buttonCorner,
      ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const,
      d.buttonCorner,
    ),
    panelSide: oneOf(s.panelSide, ['right', 'left'] as const, d.panelSide),
    cardSelectors: bool(s.cardSelectors, d.cardSelectors),
    markDownloaded: bool(s.markDownloaded, d.markDownloaded),
    readMarkers: bool(s.readMarkers, d.readMarkers),
    blurPreviews: bool(s.blurPreviews, d.blurPreviews),
    notifications: oneOf(s.notifications, ['all', 'errors', 'none'] as const, d.notifications),
    privateNotifications: bool(s.privateNotifications, d.privateNotifications),
    sendToApp: bool(s.sendToApp, d.sendToApp),
    watchIntervalMinutes: (WATCH_INTERVALS as readonly number[]).includes(
      Number(s.watchIntervalMinutes),
    )
      ? Number(s.watchIntervalMinutes)
      : d.watchIntervalMinutes,
    recordHistory: bool(s.recordHistory, d.recordHistory),
    logLevel: oneOf(s.logLevel, ['debug', 'info', 'warn', 'error'] as const, d.logLevel),
  };
}

/** Maps a browser UI language (`pt-BR`, `zh-Hans-CN`, `en-US`) to a locale. */
export function resolveLocale(preference: Settings['language'], uiLanguage: string): Locale {
  if (preference !== 'auto') return preference;
  const lang = uiLanguage.replace('-', '_').toLowerCase();
  if (lang.startsWith('zh')) return 'zh_CN';
  if (lang.startsWith('pt')) return 'pt_BR';
  const base = lang.split('_')[0] ?? 'en';
  return (LOCALES as readonly string[]).includes(base) ? (base as Locale) : 'en';
}
