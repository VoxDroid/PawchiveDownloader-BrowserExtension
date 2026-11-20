import type { FileCategory, Post } from '../pawchive/types';
import type { ConflictAction, ContentFormat, DownloadMode, PreviewOnlyAction } from '../settings';

export type JobStatus =
  'resolving' | 'queued' | 'running' | 'paused' | 'done' | 'failed' | 'cancelled';
export type ItemStatus = 'pending' | 'active' | 'done' | 'failed' | 'skipped' | 'cancelled';
export type SkipReason = 'duplicate' | 'preview-only' | 'no-relay' | 'too-large' | 'empty';

export interface JobOptions {
  mode: DownloadMode;
  categories: FileCategory[];
  saveContent: ContentFormat;
  saveMetadata: boolean;
  saveLinks: boolean;
  saveComments: boolean;
  saveAnnouncements: boolean;
  thumbnailFallback: boolean;
  /** Save every file's thumbnail instead of the file (a media server is down). */
  thumbnailsOnly: boolean;
  previewOnly: PreviewOnlyAction;
  skipDownloaded: boolean;
  folderTemplate: string;
  fileTemplate: string;
  archiveTemplate: string;
  conflictAction: ConflictAction;
  zipMaxSizeMb: number;
  zipVideosSeparately: boolean;
  zipSeparateOverMb: number;
}

export interface PostRef {
  service: string;
  creatorId: string;
  postId: string;
}

export interface CreatorInfo {
  service: string;
  id: string;
  name: string;
}

/** How to fetch one file's bytes. */
export interface FileSource {
  /** Direct URL, when known up front. */
  url: string | null;
  /** The full file has to come from the post page's temporary relay. */
  relay: boolean;
  /** Storage path, used to find the relay link on the post page. */
  path: string;
  /** Original name, the fallback key for relay lookup. */
  name: string;
}

export interface ZipEntry {
  /** Path inside the archive. */
  name: string;
  source?: FileSource;
  text?: string;
  hash: string | null;
  category: FileCategory;
}

interface ItemBase {
  id: string;
  post: PostRef;
  /** Short label shown in the UI (file name). */
  label: string;
  /** Target path relative to the downloads folder. */
  path: string;
  status: ItemStatus;
  attempts: number;
  bytes: number;
  totalBytes: number;
  error?: string;
  skipReason?: SkipReason;
  /** Browser download id while the browser is transferring it. */
  downloadId?: number;
  /** Do not start again before this time (epoch ms), for retry backoff. */
  notBefore?: number;
  /** When the item last failed for good (epoch ms), for automatic retries. */
  failedAt?: number;
  /** Automatic retries it has had. */
  autoRetries?: number;
}

export interface FileItem extends ItemBase {
  kind: 'file';
  source: FileSource;
  hash: string | null;
  category: FileCategory;
  /** Thumbnail to save instead when the full file cannot be had. */
  thumbnail?: string | null;
  /** The item already switched to its thumbnail. */
  fallback?: boolean;
}

export interface TextItem extends ItemBase {
  kind: 'text';
  text: string;
  mime: string;
  /** The text is fetched when the item runs (comments, announcements). */
  fetch?: 'comments' | 'announcements';
  /** Title, page and creator name for fetched texts. */
  meta?: { title: string; url: string; name: string };
}

export interface ZipItem extends ItemBase {
  kind: 'zip';
  entries: ZipEntry[];
  /** Entries that could not be fetched, reported once the archive is saved. */
  failedEntries?: string[];
  /** How many archive parts were written (large archives are split). */
  parts?: number;
}

export type Item = FileItem | TextItem | ZipItem;

export interface JobStats {
  total: number;
  done: number;
  failed: number;
  skipped: number;
  cancelled: number;
  active: number;
  bytes: number;
  totalBytes: number;
  /** How far the running items are, summed as fractions (0..active). */
  partial: number;
}

export interface ScanProgress {
  pages: number;
  posts: number;
  matched: number;
}

export interface Job {
  id: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  title: string;
  subtitle: string;
  creator: CreatorInfo | null;
  status: JobStatus;
  options: JobOptions;
  /** Kept while the job still has to look up its posts. */
  request?: JobRequest;
  scan?: ScanProgress;
  postCount: number;
  items: Item[];
  error?: string;
  /** Posts to re-create this job later from history ("download again"). */
  refs: PostRef[];
}

/** What the UI sends to start a job. */
export type JobRequest =
  | {
      kind: 'posts';
      title?: string;
      creator?: CreatorInfo | null;
      posts: Array<{ post: Post; fileIndexes?: number[] }>;
      options?: Partial<JobOptions>;
    }
  | {
      kind: 'refs';
      title?: string;
      creator?: CreatorInfo | null;
      refs: PostRef[];
      options?: Partial<JobOptions>;
    }
  | {
      kind: 'creator';
      service: string;
      creatorId: string;
      query?: string | null;
      /** Only these posts; all of the creator's posts when omitted. */
      postIds?: string[];
      /** Only posts published after this ISO date. */
      since?: string | null;
      options?: Partial<JobOptions>;
    };

/** The light version of a job sent to UIs many times a second. */
export interface JobSummary {
  id: string;
  title: string;
  subtitle: string;
  creator: CreatorInfo | null;
  status: JobStatus;
  mode: JobOptions['mode'];
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  postCount: number;
  stats: JobStats;
  scan?: ScanProgress;
  error?: string;
  /** Bytes per second over the last few seconds. */
  speed: number;
  current: string[];
}
