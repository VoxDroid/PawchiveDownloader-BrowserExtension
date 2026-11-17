import type { CreatorInfo, JobStatus, PostRef } from '../jobs/types';
import type { DownloadMode } from '../settings';

/**
 * IndexedDB holds what can grow large: the download history and the set of
 * files and posts already downloaded (used to skip duplicates and to mark
 * posts on the site). Small state lives in extension storage instead.
 */

export interface FileRecord {
  hash: string;
  post: string;
  path: string;
  at: number;
}

export interface PostRecord {
  key: string;
  title: string;
  at: number;
}

export interface HistoryEntry {
  id: string;
  title: string;
  subtitle: string;
  creator: CreatorInfo | null;
  mode: DownloadMode;
  status: Extract<JobStatus, 'done' | 'failed' | 'cancelled'>;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number;
  postCount: number;
  files: { done: number; failed: number; skipped: number };
  bytes: number;
  folder: string;
  /** One saved file, used to reveal the folder in the file manager. */
  firstFile?: string;
  refs: PostRef[];
  errors: string[];
}

const DB_NAME = 'pawchive-downloader';
const DB_VERSION = 1;

let opening: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('files'))
        db.createObjectStore('files', { keyPath: 'hash' });
      if (!db.objectStoreNames.contains('posts')) db.createObjectStore('posts', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('history')) {
        const store = db.createObjectStore('history', { keyPath: 'id' });
        store.createIndex('finishedAt', 'finishedAt');
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      opening = null;
      reject(request.error ?? new Error('Could not open the database'));
    };
  });
  return opening;
}

/** Closes the connection (tests delete the database between runs). */
export async function closeDb(): Promise<void> {
  if (!opening) return;
  const db = await opening.catch(() => null);
  db?.close();
  opening = null;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Request failed'));
  });
}

export const postKey = (ref: PostRef): string => `${ref.service}:${ref.creatorId}:${ref.postId}`;

export async function knownHashes(hashes: readonly string[]): Promise<Set<string>> {
  const found = new Set<string>();
  if (hashes.length === 0) return found;
  const db = await openDb();
  const tx = db.transaction('files', 'readonly');
  const store = tx.objectStore('files');
  await Promise.all(
    hashes.map(async (hash) => {
      if ((await result(store.getKey(hash))) !== undefined) found.add(hash);
    }),
  );
  return found;
}

export async function knownPosts(keys: readonly string[]): Promise<Set<string>> {
  const found = new Set<string>();
  if (keys.length === 0) return found;
  const db = await openDb();
  const store = db.transaction('posts', 'readonly').objectStore('posts');
  await Promise.all(
    keys.map(async (key) => {
      if ((await result(store.getKey(key))) !== undefined) found.add(key);
    }),
  );
  return found;
}

export async function recordDownloads(
  files: readonly FileRecord[],
  posts: readonly PostRecord[],
): Promise<void> {
  if (files.length === 0 && posts.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(['files', 'posts'], 'readwrite');
  const fileStore = tx.objectStore('files');
  const postStore = tx.objectStore('posts');
  for (const file of files) fileStore.put(file);
  for (const post of posts) postStore.put(post);
  await done(tx);
}

export async function addHistory(entry: HistoryEntry): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('history', 'readwrite');
  tx.objectStore('history').put(entry);
  await done(tx);
}

export async function listHistory(): Promise<HistoryEntry[]> {
  const db = await openDb();
  const store = db.transaction('history', 'readonly').objectStore('history');
  const all = await result(store.index('finishedAt').getAll());
  return (all as HistoryEntry[]).reverse();
}

export async function removeHistory(ids: readonly string[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('history', 'readwrite');
  const store = tx.objectStore('history');
  for (const id of ids) store.delete(id);
  await done(tx);
}

/** Clears the history list; `alsoKnownFiles` also forgets downloaded files. */
export async function clearHistory(alsoKnownFiles: boolean): Promise<void> {
  const db = await openDb();
  const stores = alsoKnownFiles ? ['history', 'files', 'posts'] : ['history'];
  const tx = db.transaction(stores, 'readwrite');
  for (const name of stores) tx.objectStore(name).clear();
  await done(tx);
}

export async function countKnown(): Promise<{ files: number; posts: number; history: number }> {
  const db = await openDb();
  const tx = db.transaction(['files', 'posts', 'history'], 'readonly');
  const [files, posts, history] = await Promise.all([
    result(tx.objectStore('files').count()),
    result(tx.objectStore('posts').count()),
    result(tx.objectStore('history').count()),
  ]);
  return { files, posts, history };
}

/** Rows for a CSV export of the history. */
export function historyToCsv(entries: readonly HistoryEntry[]): string {
  const header = [
    'finished',
    'title',
    'creator',
    'service',
    'status',
    'mode',
    'posts',
    'files_done',
    'files_failed',
    'files_skipped',
    'bytes',
    'folder',
  ];
  const escape = (value: unknown) => {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows = entries.map((e) =>
    [
      new Date(e.finishedAt).toISOString(),
      e.title,
      e.creator?.name ?? '',
      e.creator?.service ?? '',
      e.status,
      e.mode,
      e.postCount,
      e.files.done,
      e.files.failed,
      e.files.skipped,
      e.bytes,
      e.folder,
    ]
      .map(escape)
      .join(','),
  );
  return `${[header.join(','), ...rows].join('\r\n')}\r\n`;
}
