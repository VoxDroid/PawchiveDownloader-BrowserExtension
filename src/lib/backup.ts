/**
 * One file with everything worth keeping: settings, watchlist, favorites,
 * download history and read markers. Restoring adds what is missing and keeps
 * what is already here, like the desktop app's backups.
 */
import type { Favorite } from './favorites';
import { coerceSettings, type Settings } from './settings';
import type { HistoryEntry } from './storage/db';
import type { WatchEntry } from './watch';

export const BACKUP_FORMAT = 'pawchive-downloader-extension-backup';

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  createdAt: string;
  settings: Settings;
  watchlist: WatchEntry[];
  favorites: Favorite[];
  history: HistoryEntry[];
  reads: string[];
}

export interface BackupState {
  settings: Settings;
  watchlist: WatchEntry[];
  favorites: Favorite[];
  history: HistoryEntry[];
  reads: string[];
}

export function createBackup(state: BackupState, now = new Date()): Backup {
  return { format: BACKUP_FORMAT, version: 1, createdAt: now.toISOString(), ...state };
}

/** The backup in a file's text, or null when it is not one. */
export function parseBackup(text: string): Backup | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const b = data as Partial<Backup>;
  if (b.format !== BACKUP_FORMAT) return null;
  const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    format: BACKUP_FORMAT,
    version: 1,
    createdAt: typeof b.createdAt === 'string' ? b.createdAt : '',
    settings: coerceSettings(b.settings),
    watchlist: list<WatchEntry>(b.watchlist).filter((w) => w && typeof w.key === 'string'),
    favorites: list<Favorite>(b.favorites).filter((f) => f && typeof f.key === 'string'),
    history: list<HistoryEntry>(b.history).filter((h) => h && typeof h.id === 'string'),
    reads: list<string>(b.reads).filter((r) => typeof r === 'string'),
  };
}

export interface RestorePlan {
  /** Settings come from the backup (they are one object, not a list). */
  settings: Settings;
  watchlist: WatchEntry[];
  favorites: Favorite[];
  /** History entries to add (the ones missing here). */
  newHistory: HistoryEntry[];
  reads: string[];
  report: { watch: number; favorites: number; history: number };
}

/** What restoring the backup changes: missing things are added, nothing is removed. */
export function planRestore(backup: Backup, current: BackupState, maxReads = 20_000): RestorePlan {
  const watchKeys = new Set(current.watchlist.map((w) => w.key));
  const addWatch = backup.watchlist.filter((w) => !watchKeys.has(w.key));
  const favKeys = new Set(current.favorites.map((f) => f.key));
  const addFavorites = backup.favorites.filter((f) => !favKeys.has(f.key));
  const historyIds = new Set(current.history.map((h) => h.id));
  const newHistory = backup.history.filter((h) => !historyIds.has(h.id));
  const reads = [...new Set([...current.reads, ...backup.reads])].slice(0, maxReads);
  return {
    settings: backup.settings,
    watchlist: [...current.watchlist, ...addWatch],
    favorites: [...current.favorites, ...addFavorites],
    newHistory,
    reads,
    report: { watch: addWatch.length, favorites: addFavorites.length, history: newHistory.length },
  };
}
