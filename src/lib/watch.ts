import type { Post } from './pawchive/types';

/** A creator the user follows for new posts. */
export interface WatchEntry {
  key: string;
  service: string;
  creatorId: string;
  name: string;
  addedAt: number;
  lastCheckedAt: number | null;
  /** Ids of the newest posts already seen (bounded). */
  seenIds: string[];
  newPosts: NewPost[];
  error: string | null;
  /** Queue new posts for download automatically when found. */
  autoDownload: boolean;
}

export interface NewPost {
  id: string;
  title: string;
  published: string | null;
  files: number;
}

export const SEEN_LIMIT = 300;

export const watchKey = (service: string, creatorId: string): string => `${service}:${creatorId}`;

export function createWatchEntry(
  service: string,
  creatorId: string,
  name: string,
  now = Date.now(),
): WatchEntry {
  return {
    key: watchKey(service, creatorId),
    service,
    creatorId,
    name,
    addedAt: now,
    lastCheckedAt: null,
    seenIds: [],
    newPosts: [],
    error: null,
    autoDownload: false,
  };
}

/**
 * Applies a fresh first page of a creator's posts (newest first). The first
 * check only records a baseline, so following a creator does not flag their
 * whole back catalogue as new.
 */
export function applyCheck(
  entry: WatchEntry,
  page: readonly Post[],
  now = Date.now(),
): { entry: WatchEntry; found: NewPost[] } {
  const seen = new Set(entry.seenIds);
  // No good check yet: never checked, or every check so far failed (offline,
  // the site down). A failed first check must not turn the next good one
  // into "the whole first page is new".
  const baseline =
    entry.seenIds.length === 0 && (entry.lastCheckedAt === null || entry.error !== null);
  const found: NewPost[] = baseline
    ? []
    : page
        .filter((post) => !seen.has(post.id))
        .map((post) => ({
          id: post.id,
          title: post.title,
          published: post.published,
          files: post.files.length,
        }));

  const known = new Set(entry.newPosts.map((p) => p.id));
  const newPosts = [...found.filter((p) => !known.has(p.id)), ...entry.newPosts];
  const seenIds = [...new Set([...page.map((p) => p.id), ...entry.seenIds])].slice(0, SEEN_LIMIT);
  return {
    entry: { ...entry, seenIds, newPosts, lastCheckedAt: now, error: null },
    found: found.filter((p) => !known.has(p.id)),
  };
}

export function markSeen(entry: WatchEntry, ids?: readonly string[]): WatchEntry {
  if (!ids) return { ...entry, newPosts: [] };
  const drop = new Set(ids);
  return { ...entry, newPosts: entry.newPosts.filter((p) => !drop.has(p.id)) };
}

export function totalNew(entries: readonly WatchEntry[]): number {
  return entries.reduce((sum, e) => sum + e.newPosts.length, 0);
}
