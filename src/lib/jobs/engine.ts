import type { Logger } from '../log';
import { abortError, isAbortError, type Release, type SiteLimiter } from '../net/limiter';
import type { PawchiveClient } from '../pawchive/client';
import { findRelay, type RelayIndex } from '../pawchive/relay';
import type { Post } from '../pawchive/types';
import type { FileRecord, HistoryEntry, PostRecord } from '../storage/db';
import { postKey } from '../storage/db';
import type { Settings } from '../settings';
import type { ZipResult, ZipSpec } from '../zip/builder';
import {
  announcementsItem,
  announcementsText,
  commentsText,
  computeStats,
  hashesOf,
  optionsFromSettings,
  planPost,
} from './plan';
import type {
  CreatorInfo,
  TextItem,
  FileItem,
  Item,
  Job,
  JobRequest,
  JobStatus,
  JobSummary,
  PostRef,
  ZipItem,
} from './types';
import { siteOfService, siteOrigin } from '../pawchive/sites';

/** The site an item belongs to, as a URL the limiter can key on. */
function siteUrlOf(item: { post: { service: string } }): string {
  return `${siteOrigin(siteOfService(item.post.service))}/`;
}

export type DownloadState = 'in_progress' | 'interrupted' | 'complete';

export interface DownloadSnapshot {
  id: number;
  state: DownloadState;
  bytesReceived: number;
  totalBytes: number;
  error?: string;
}

export interface DownloadsPort {
  start(options: {
    url: string;
    filename: string;
    conflictAction: Settings['conflictAction'];
  }): Promise<number>;
  cancel(id: number): Promise<void>;
  erase(id: number): Promise<void>;
  get(id: number): Promise<DownloadSnapshot | null>;
}

export interface ObjectUrl {
  url: string;
  revoke(): void;
}

export interface ZipPort {
  /** Builds the archive and returns object URLs for its parts. */
  run(
    spec: ZipSpec,
    hooks: { progress(bytes: number): void },
    signal: AbortSignal,
  ): Promise<Omit<ZipResult, 'parts'> & { parts: Array<ObjectUrl & { size: number }> }>;
}

export interface EngineDeps {
  client: PawchiveClient;
  limiter: SiteLimiter;
  downloads: DownloadsPort;
  zip: ZipPort;
  textUrl(text: string, mime: string): Promise<ObjectUrl>;
  settings(): Settings;
  store: { load(): Promise<Job[]>; save(jobs: Job[]): Promise<void> };
  history: {
    knownHashes(hashes: string[]): Promise<Set<string>>;
    record(files: FileRecord[], posts: PostRecord[]): Promise<void>;
    add(entry: HistoryEntry): Promise<void>;
  };
  log: Logger;
  onChange(): void;
  onJobFinished(job: Job): void;
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  newId?: () => string;
}

export type JobAction = 'pause' | 'resume' | 'cancel' | 'retry' | 'remove';

/** Interrupt reasons that a later attempt will not fix. */
const FATAL_ERRORS = new Set([
  'FILE_ACCESS_DENIED',
  'FILE_NO_SPACE',
  'FILE_NAME_TOO_LONG',
  'FILE_TOO_LARGE',
  'FILE_VIRUS_INFECTED',
  'FILE_BLOCKED',
  'FILE_SECURITY_CHECK_FAILED',
  'SERVER_BAD_CONTENT',
]);

interface Active {
  jobId: string;
  itemId: string;
  abort: AbortController;
  release?: Release;
  /** Set while the engine itself cancels the browser download. */
  stopping?: 'pause' | 'cancel';
}

interface Waiter {
  resolve(state: DownloadSnapshot): void;
}

const RELAY_TTL_MS = 10 * 60 * 1000;
const FINISHED: ReadonlySet<JobStatus> = new Set(['done', 'failed', 'cancelled']);

export class DownloadEngine {
  private jobs: Job[] = [];
  private readonly active = new Map<string, Active>();
  private readonly waiters = new Map<number, Waiter>();
  /** Relay links per post, shared by every file of the post (in flight too). */
  private readonly relays = new Map<string, { index: Promise<RelayIndex>; at: number }>();
  private readonly speed = new Map<string, Array<{ at: number; bytes: number }>>();
  private readonly resolving = new Map<string, AbortController>();
  private wakeTimer: unknown = null;
  private saveTimer: unknown = null;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly newId: () => string;
  private loaded = false;

  constructor(private readonly deps: EngineDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.setTimer = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer =
      deps.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  // ---------------------------------------------------------------- state

  /** Loads saved jobs and reconciles them with the browser's downloads. */
  async init(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    this.jobs = await this.deps.store.load().catch((error) => {
      this.deps.log.error('Could not load saved jobs', error);
      return [];
    });
    for (const job of this.jobs) {
      if (job.status === 'resolving') {
        void this.resolve(job);
        continue;
      }
      for (const item of job.items) {
        if (item.status !== 'active') continue;
        if (item.kind === 'file' && item.downloadId !== undefined) {
          const snapshot = await this.deps.downloads.get(item.downloadId).catch(() => null);
          if (snapshot?.state === 'complete') {
            item.status = 'done';
            item.bytes = item.totalBytes = snapshot.totalBytes || snapshot.bytesReceived;
            continue;
          }
          if (snapshot?.state === 'in_progress') {
            this.adopt(job, item, item.downloadId);
            continue;
          }
        }
        // Whatever was in flight when the browser stopped us starts over.
        item.status = 'pending';
        item.downloadId = undefined;
      }
      this.checkFinished(job);
    }
    this.persist();
    this.pump();
  }

  list(): JobSummary[] {
    return this.jobs.map((job) => this.summary(job));
  }

  get(jobId: string): Job | undefined {
    return this.jobs.find((j) => j.id === jobId);
  }

  get busy(): boolean {
    return this.jobs.some((j) => !FINISHED.has(j.status) && j.status !== 'paused');
  }

  get activeCount(): number {
    return this.jobs.filter(
      (j) => j.status === 'running' || j.status === 'resolving' || j.status === 'queued',
    ).length;
  }

  private summary(job: Job): JobSummary {
    const stats = computeStats(job.items);
    return {
      id: job.id,
      title: job.title,
      subtitle: job.subtitle,
      creator: job.creator,
      status: job.status,
      mode: job.options.mode,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      postCount: job.postCount,
      stats,
      scan: job.scan,
      error: job.error,
      speed: this.speedOf(job.id, stats.bytes),
      current: job.items
        .filter((i) => i.status === 'active')
        .slice(0, 3)
        .map((i) => i.label),
    };
  }

  private speedOf(jobId: string, bytes: number): number {
    const now = this.now();
    const samples = (this.speed.get(jobId) ?? []).filter((s) => now - s.at <= 5000);
    const last = samples[samples.length - 1];
    if (!last || now - last.at >= 400) samples.push({ at: now, bytes });
    this.speed.set(jobId, samples);
    const first = samples[0];
    if (!first || samples.length < 2) return 0;
    const span = (now - first.at) / 1000;
    return span > 0 ? Math.max(0, (bytes - first.bytes) / span) : 0;
  }

  private changed(): void {
    this.deps.onChange();
    this.persist();
  }

  private persist(immediate = false): void {
    if (this.saveTimer !== null) {
      if (!immediate) return;
      this.clearTimer(this.saveTimer);
    }
    const save = () => {
      this.saveTimer = null;
      void this.deps.store
        .save(this.jobs)
        .catch((error) => this.deps.log.warn('Could not save jobs', error));
    };
    if (immediate) save();
    else this.saveTimer = this.setTimer(save, 1000);
  }

  // ------------------------------------------------------------ creating

  async create(request: JobRequest): Promise<string> {
    const settings = this.deps.settings();
    const options = optionsFromSettings(settings, request.options);
    const job: Job = {
      id: this.newId(),
      createdAt: this.now(),
      title: '',
      subtitle: '',
      creator: null,
      status: 'resolving',
      options,
      postCount: 0,
      items: [],
      refs: [],
    };

    if (request.kind === 'posts') {
      job.creator = request.creator ?? null;
      job.title = request.title ?? request.posts[0]?.post.title ?? 'Posts';
      job.subtitle = job.creator?.name ?? '';
      await this.planPosts(
        job,
        request.posts.map((p) => ({ post: p.post, fileIndexes: p.fileIndexes })),
      );
      job.status = 'queued';
    } else {
      job.request = request;
      if (request.kind === 'refs') {
        job.creator = request.creator ?? null;
        job.title = request.title ?? `${request.refs.length} posts`;
      } else {
        job.title = request.creatorId;
        job.creator = { service: request.service, id: request.creatorId, name: request.creatorId };
      }
    }

    this.jobs.push(job);
    this.deps.log.info(
      job.request
        ? `Queued "${job.title}", looking up posts`
        : `Queued "${job.title}" (${job.items.length} items)`,
    );
    this.changed();
    if (job.status === 'resolving') void this.resolve(job);
    else {
      this.checkFinished(job);
      this.pump();
    }
    return job.id;
  }

  private async planPosts(
    job: Job,
    posts: Array<{ post: Post; fileIndexes?: number[] }>,
  ): Promise<void> {
    const known = job.options.skipDownloaded
      ? await this.deps.history
          .knownHashes(hashesOf(posts.map((p) => p.post)))
          .catch(() => new Set<string>())
      : new Set<string>();
    const now = new Date(this.now());
    for (const { post, fileIndexes } of posts) {
      const items = planPost(post, job.creator, job.options, fileIndexes, known, now);
      // The same file often appears in several posts: fetch it once per job.
      if (job.options.skipDownloaded) {
        for (const item of items)
          if (item.kind === 'file' && item.hash && item.status === 'pending') known.add(item.hash);
      }
      job.items.push(...items);
      job.refs.push({ service: post.service, creatorId: post.creatorId, postId: post.id });
    }
    job.postCount = posts.length;
    if (
      job.options.saveAnnouncements &&
      job.creator &&
      posts.length > 0 &&
      !job.items.some((i) => i.id === 'creator:announcements')
    ) {
      job.items.push(announcementsItem(job.options, job.creator, now));
    }
  }

  /** Looks up the posts a job asked for, then plans its items. */
  private async resolve(job: Job): Promise<void> {
    const request = job.request;
    if (!request || request.kind === 'posts') return;
    const controller = new AbortController();
    this.resolving.set(job.id, controller);
    const { client, log } = this.deps;
    try {
      let posts: Post[] = [];
      if (request.kind === 'refs') {
        job.scan = { pages: 0, posts: 0, matched: 0 };
        const creators = new Map<string, CreatorInfo>();
        for (const ref of request.refs) {
          try {
            posts.push(
              await client.getPost(ref.service, ref.creatorId, ref.postId, controller.signal),
            );
          } catch (error) {
            if (controller.signal.aborted) throw error;
            log.warn(`Could not load post ${ref.postId}`, error);
          }
          job.scan.posts += 1;
          job.scan.matched = posts.length;
          this.deps.onChange();
        }
        const ids = new Set(posts.map((p) => `${p.service}:${p.creatorId}`));
        if (ids.size === 1 && posts[0] && !job.creator) {
          const first = posts[0];
          const creator = await client
            .getCreator(first.service, first.creatorId, controller.signal)
            .catch(() => null);
          if (creator)
            creators.set(`${first.service}:${first.creatorId}`, {
              service: creator.service,
              id: creator.id,
              name: creator.name,
            });
          job.creator = creators.values().next().value ?? null;
        }
        if (posts.length === 1 && posts[0] && !request.title)
          job.title = posts[0].title || posts[0].id;
      } else {
        const creator = await client
          .getCreator(request.service, request.creatorId, controller.signal)
          .catch(() => null);
        job.creator = {
          service: request.service,
          id: request.creatorId,
          name: creator?.name ?? request.creatorId,
        };
        job.title = creator?.name ?? request.creatorId;
        const wanted = request.postIds ? new Set(request.postIds) : null;
        const since = request.since ?? null;
        job.scan = { pages: 0, posts: 0, matched: 0 };
        const all = await client.getAllCreatorPosts(request.service, request.creatorId, {
          query: request.query ?? null,
          signal: controller.signal,
          onProgress: (progress) => {
            job.scan = {
              pages: progress.pages,
              posts: progress.posts,
              matched: job.scan?.matched ?? 0,
            };
            this.deps.onChange();
          },
          // Posts come newest first: once a page is entirely older than
          // `since`, or every wanted post has been seen, stop paging.
          stopWhen: (page) => {
            if (since && page.every((p) => (p.published ?? '') <= since)) return true;
            if (wanted) {
              for (const p of page) wanted.delete(p.id);
              return wanted.size === 0;
            }
            return false;
          },
        });
        const keep = request.postIds ? new Set(request.postIds) : null;
        posts = all.filter(
          (p) => (!keep || keep.has(p.id)) && (!since || (p.published ?? '') > since),
        );
        job.scan.matched = posts.length;
      }
      job.subtitle =
        job.creator?.name && job.creator.name !== job.title ? job.creator.name : job.subtitle;
      await this.planPosts(
        job,
        posts.map((post) => ({ post })),
      );
      delete job.request;
      if (posts.length === 0) {
        job.error = 'nothing-found';
      }
      job.status = 'queued';
      log.info(`Resolved "${job.title}": ${posts.length} posts, ${job.items.length} items`);
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      job.finishedAt = this.now();
      log.error(`Could not look up "${job.title}"`, error);
      this.deps.onJobFinished(job);
    } finally {
      this.resolving.delete(job.id);
    }
    this.checkFinished(job);
    this.changed();
    this.pump();
  }

  // ----------------------------------------------------------- scheduling

  /** Starts as many pending items as the concurrency setting allows. */
  pump(): void {
    if (this.wakeTimer !== null) {
      this.clearTimer(this.wakeTimer);
      this.wakeTimer = null;
    }
    const concurrency = this.deps.settings().concurrency;
    const now = this.now();
    let nextWake = Number.POSITIVE_INFINITY;
    for (const job of this.jobs) {
      if (job.status !== 'queued' && job.status !== 'running') continue;
      for (const item of job.items) {
        if (this.active.size >= concurrency) break;
        if (item.status !== 'pending') continue;
        if (item.notBefore && item.notBefore > now) {
          nextWake = Math.min(nextWake, item.notBefore);
          continue;
        }
        this.start(job, item);
      }
    }
    if (Number.isFinite(nextWake) && this.active.size < concurrency) {
      this.wakeTimer = this.setTimer(
        () => {
          this.wakeTimer = null;
          this.pump();
        },
        Math.max(50, nextWake - now),
      );
    }
  }

  private start(job: Job, item: Item): void {
    item.status = 'active';
    item.error = undefined;
    if (job.status === 'queued') {
      job.status = 'running';
      job.startedAt ??= this.now();
    }
    const active: Active = { jobId: job.id, itemId: item.id, abort: new AbortController() };
    this.active.set(item.id + job.id, active);
    this.deps.onChange();
    const run =
      item.kind === 'zip' ? this.runZip(job, item, active) : this.runSingle(job, item, active);
    void run
      .then(() => this.settle(job, item, active, null))
      .catch((error: unknown) => this.settle(job, item, active, error));
  }

  /** Re-attaches to a browser download that survived a restart. */
  private adopt(job: Job, item: Item, downloadId: number): void {
    const active: Active = { jobId: job.id, itemId: item.id, abort: new AbortController() };
    this.active.set(item.id + job.id, active);
    void (async () => {
      active.release = await this.deps.limiter.acquire(siteUrlOf(item), active.abort.signal);
      const state = await this.waitFor(downloadId, item);
      this.finishDownload(item, state);
    })()
      .then(() => this.settle(job, item, active, null))
      .catch((error: unknown) => this.settle(job, item, active, error));
  }

  private async runSingle(job: Job, item: Exclude<Item, ZipItem>, active: Active): Promise<void> {
    const { downloads, limiter } = this.deps;
    if (item.kind === 'text') {
      if (item.fetch) {
        const text = await this.fetchText(item, active.abort.signal);
        if (text === null) {
          item.status = 'skipped';
          item.skipReason = 'empty';
          return;
        }
        item.text = text;
      }
      const object = await this.deps.textUrl(item.text, item.mime);
      try {
        const id = await downloads.start({
          url: object.url,
          filename: item.path,
          conflictAction: job.options.conflictAction,
        });
        item.downloadId = id;
        this.finishDownload(item, await this.waitFor(id, item));
      } finally {
        object.revoke();
      }
      return;
    }

    let url = item.source.url;
    if (item.source.relay) {
      url = await this.relayUrl(item.post, item.source, active.abort.signal);
      if (!url) {
        item.status = 'skipped';
        item.skipReason = 'no-relay';
        return;
      }
    }
    if (!url) throw new Error('No download link');
    active.release = await limiter.acquire(url, active.abort.signal);
    const id = await downloads.start({
      url,
      filename: item.path,
      conflictAction: job.options.conflictAction,
    });
    item.downloadId = id;
    this.persist(true);
    this.finishDownload(item, await this.waitFor(id, item));
  }

  /** The text of a comments or announcements item, or null when there is none. */
  private async fetchText(item: TextItem, signal: AbortSignal): Promise<string | null> {
    const { client } = this.deps;
    const meta = item.meta ?? { title: item.post.postId, url: '', name: item.post.creatorId };
    if (item.fetch === 'comments') {
      const list = await client.getComments(
        item.post.service,
        item.post.creatorId,
        item.post.postId,
        signal,
      );
      return list.length > 0 ? commentsText(meta.title, meta.url, list) : null;
    }
    const list = await client.getAnnouncements(item.post.service, item.post.creatorId, signal);
    return list.length > 0 ? announcementsText(meta.name, list) : null;
  }

  /**
   * Puts failed files back in the queue once they have waited `afterMs`; each
   * file gets `max` such second chances. Servers that were down are often back
   * by then. Returns how many items were queued again.
   */
  autoRetry(afterMs: number, max: number): number {
    const now = this.now();
    let count = 0;
    for (const job of this.jobs) {
      if (job.status === 'paused' || job.status === 'cancelled' || job.status === 'resolving')
        continue;
      let any = false;
      for (const item of job.items) {
        if (item.status !== 'failed' || item.failedAt === undefined) continue;
        if ((item.autoRetries ?? 0) >= max || now - item.failedAt < afterMs) continue;
        item.status = 'pending';
        item.attempts = 0;
        item.error = undefined;
        item.notBefore = undefined;
        item.failedAt = undefined;
        item.autoRetries = (item.autoRetries ?? 0) + 1;
        any = true;
        count += 1;
      }
      if (any && FINISHED.has(job.status)) {
        job.status = 'queued';
        job.finishedAt = undefined;
        job.error = undefined;
      }
    }
    if (count > 0) {
      this.deps.log.info(`Trying ${count} failed files again automatically`);
      this.persist();
      this.changed();
      this.pump();
    }
    return count;
  }

  /**
   * Switches a file to its thumbnail when the full file cannot be had (its
   * media server is down or the file is gone), as the desktop app does.
   */
  private fallBackToThumbnail(job: Job, item: Item, reason: string): boolean {
    if (item.kind !== 'file' || item.fallback || !item.thumbnail) return false;
    if (!job.options.thumbnailFallback) return false;
    item.fallback = true;
    item.source = { url: item.thumbnail, relay: false, path: item.source.path, name: item.label };
    item.hash = null;
    item.attempts = 0;
    item.status = 'pending';
    item.notBefore = undefined;
    item.error = undefined;
    const dot = item.path.lastIndexOf('.');
    const slash = item.path.lastIndexOf('/');
    const ext = item.thumbnail.match(/\.([a-z0-9]{2,5})(?:$|\?)/i)?.[1]?.toLowerCase() ?? 'jpg';
    const stem = dot > slash ? item.path.slice(0, dot) : item.path;
    item.path = `${stem}_preview.${ext}`;
    item.label = item.path.slice(item.path.lastIndexOf('/') + 1);
    this.deps.log.warn(`Saving the thumbnail of ${item.label} instead`, reason);
    return true;
  }

  private finishDownload(item: Item, state: DownloadSnapshot): void {
    if (state.state === 'complete') {
      item.bytes = item.totalBytes = Math.max(state.totalBytes, state.bytesReceived, item.bytes);
      return;
    }
    throw Object.assign(new Error(state.error ?? 'Download interrupted'), {
      code: state.error ?? 'FAILED',
    });
  }

  private async runZip(job: Job, item: ZipItem, active: Active): Promise<void> {
    const { limiter, downloads, log } = this.deps;
    const signal = active.abort.signal;
    active.release = await limiter.acquire(siteUrlOf(item), signal);

    const entries: ZipSpec['entries'] = [];
    for (const entry of item.entries) {
      if (entry.text !== undefined) {
        entries.push({ name: entry.name, text: entry.text, category: entry.category });
        continue;
      }
      let url = entry.source?.url ?? null;
      if (entry.source?.relay) url = await this.relayUrl(item.post, entry.source, signal);
      entries.push({ name: entry.name, url: url ?? undefined, category: entry.category });
    }

    const settings = this.deps.settings();
    const result = await this.deps.zip.run(
      {
        entries,
        maxPartBytes: job.options.zipMaxSizeMb * 1024 * 1024,
        separateOverBytes: job.options.zipSeparateOverMb * 1024 * 1024,
        maxRetries: settings.maxRetries,
      },
      {
        progress: (bytes) => {
          item.bytes = bytes;
          this.deps.onChange();
        },
      },
      signal,
    );

    try {
      const total = result.parts.length;
      item.parts = total;
      for (let i = 0; i < total; i++) {
        const part = result.parts[i] as ObjectUrl & { size: number };
        const filename =
          total > 1 ? item.path.replace(/\.zip$/i, ` (part ${i + 1} of ${total}).zip`) : item.path;
        const id = await downloads.start({
          url: part.url,
          filename,
          conflictAction: job.options.conflictAction,
        });
        this.finishDownload(item, await this.waitFor(id, item));
      }
    } finally {
      for (const part of result.parts) part.revoke();
    }
    item.totalBytes = item.bytes = result.parts.reduce((sum, p) => sum + p.size, 0);
    item.failedEntries = result.failed.map((f) => `${f.name}: ${f.error}`);
    if (result.failed.length)
      log.warn(`${result.failed.length} files missing from ${item.label}`, item.failedEntries);

    // Files too large for the archive are saved next to it.
    const folder = item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : '';
    const archiveStem = (item.path.split('/').pop() ?? '').replace(/\.zip$/i, '');
    for (const deferred of result.deferred) {
      const extra: FileItem = {
        id: `${item.id}:${deferred.name}`,
        kind: 'file',
        post: item.post,
        label: deferred.name,
        path: `${folder ? `${folder}/` : ''}${archiveStem}/${deferred.name}`,
        status: 'pending',
        attempts: 0,
        bytes: 0,
        totalBytes: deferred.size,
        source: { url: deferred.url, relay: false, path: '', name: deferred.name },
        hash: null,
        category: 'other',
      };
      job.items.push(extra);
    }
  }

  private waitFor(downloadId: number, item: Item): Promise<DownloadSnapshot> {
    return new Promise<DownloadSnapshot>((resolve) => {
      this.waiters.set(downloadId, {
        resolve: (state) => {
          this.waiters.delete(downloadId);
          resolve(state);
        },
      });
      // The download may have finished before the listener was attached.
      void this.deps.downloads.get(downloadId).then((state) => {
        if (state && state.state !== 'in_progress') this.waiters.get(downloadId)?.resolve(state);
        else if (state) {
          item.bytes = state.bytesReceived;
          item.totalBytes = state.totalBytes;
        }
      });
    });
  }

  /** Feed from the browser's downloads.onChanged event. */
  onDownloadChanged(id: number, state: DownloadState | undefined, error?: string): void {
    const waiter = this.waiters.get(id);
    if (!waiter || !state || state === 'in_progress') return;
    void this.deps.downloads.get(id).then((snapshot) => {
      waiter.resolve(snapshot ?? { id, state, bytesReceived: 0, totalBytes: 0, error });
    });
  }

  /** Polls byte counts of running browser downloads (call every ~second). */
  async refreshProgress(): Promise<void> {
    let touched = false;
    for (const active of this.active.values()) {
      const job = this.get(active.jobId);
      const item = job?.items.find((i) => i.id === active.itemId);
      if (!item || item.kind === 'zip' || item.downloadId === undefined) continue;
      const state = await this.deps.downloads.get(item.downloadId).catch(() => null);
      if (!state) continue;
      item.bytes = state.bytesReceived;
      item.totalBytes = Math.max(state.totalBytes, 0);
      touched = true;
    }
    if (touched) this.deps.onChange();
  }

  private settle(job: Job, item: Item, active: Active, error: unknown): void {
    active.release?.();
    this.active.delete(item.id + job.id);
    const { log } = this.deps;

    if (error === null) {
      if (item.status === 'active') item.status = 'done';
      if (item.status === 'done') this.recordDone(job, item);
    } else if (active.stopping === 'pause') {
      item.status = 'pending';
    } else if (active.stopping === 'cancel' || job.status === 'cancelled') {
      item.status = 'cancelled';
    } else if (isAbortError(error)) {
      item.status = 'pending';
    } else {
      const code = (error as { code?: string }).code ?? '';
      const message = error instanceof Error ? error.message : String(error);
      item.attempts += 1;
      if (code === 'USER_CANCELED') {
        item.status = 'cancelled';
        item.error = 'Cancelled in the browser';
      } else if (
        FATAL_ERRORS.has(code) ||
        /invalid filename/i.test(message) ||
        item.attempts > this.deps.settings().maxRetries
      ) {
        // A file the server does not have, or one that kept failing: its
        // thumbnail is better than nothing. Disk errors are not the server's.
        const serverSide = !code.startsWith('FILE_') && !/invalid filename/i.test(message);
        if (!(serverSide && this.fallBackToThumbnail(job, item, message))) {
          item.status = 'failed';
          item.error = message;
          item.failedAt = this.now();
          log.warn(`Failed: ${item.label}`, message);
        }
      } else {
        // Network and server errors may be the site throttling us: slow
        // everyone down, and fetch relay links afresh in case they expired.
        if (code.startsWith('SERVER') || code.startsWith('NETWORK') || code === 'FAILED') {
          const url = item.kind === 'file' ? (item.source.url ?? siteUrlOf(item)) : siteUrlOf(item);
          this.deps.limiter.penalize(url, item.attempts - 1);
        }
        if (item.kind === 'file' && item.source.relay) this.relays.delete(postKey(item.post));
        item.status = 'pending';
        item.notBefore = this.now() + this.deps.limiter.backoff(item.attempts - 1);
        item.error = message;
        log.info(`Retrying ${item.label} (attempt ${item.attempts + 1})`, message);
      }
    }
    if (item.downloadId !== undefined && item.status !== 'done') {
      const id = item.downloadId;
      void this.deps.downloads.erase(id).catch(() => undefined);
    }
    item.downloadId = undefined;
    this.checkFinished(job);
    this.changed();
    this.pump();
  }

  private recordDone(job: Job, item: Item): void {
    if (!this.deps.settings().recordHistory) return;
    const at = this.now();
    const files: FileRecord[] = [];
    if (item.kind === 'file' && item.hash)
      files.push({ hash: item.hash, post: postKey(item.post), path: item.path, at });
    if (item.kind === 'zip') {
      const failed = new Set((item.failedEntries ?? []).map((f) => f.split(': ')[0]));
      for (const entry of item.entries) {
        if (entry.hash && !failed.has(entry.name))
          files.push({ hash: entry.hash, post: postKey(item.post), path: item.path, at });
      }
    }
    const title = job.items.length ? job.title : '';
    void this.deps.history
      .record(files, [{ key: postKey(item.post), title, at }])
      .catch((error) => this.deps.log.warn('Could not record download', error));
  }

  private checkFinished(job: Job): void {
    if (job.status === 'resolving' || job.status === 'paused' || FINISHED.has(job.status)) return;
    if (job.items.some((i) => i.status === 'pending' || i.status === 'active')) return;
    const stats = computeStats(job.items);
    job.status = stats.failed > 0 && stats.done === 0 ? 'failed' : 'done';
    job.finishedAt = this.now();
    this.finalize(job);
  }

  private finalize(job: Job): void {
    this.speed.delete(job.id);
    const stats = computeStats(job.items);
    this.deps.log.info(
      `Finished "${job.title}": ${stats.done} saved, ${stats.failed} failed, ${stats.skipped} skipped`,
    );
    if (this.deps.settings().recordHistory && (job.items.length > 0 || job.error)) {
      const paths = job.items.filter((i) => i.status === 'done').map((i) => i.path);
      const entry: HistoryEntry = {
        id: job.id,
        title: job.title,
        subtitle: job.subtitle,
        creator: job.creator,
        mode: job.options.mode,
        status: job.status as HistoryEntry['status'],
        createdAt: job.createdAt,
        startedAt: job.startedAt ?? null,
        finishedAt: job.finishedAt ?? this.now(),
        postCount: job.postCount,
        files: { done: stats.done, failed: stats.failed, skipped: stats.skipped },
        bytes: stats.bytes,
        folder: commonFolder(paths),
        firstFile: paths[0],
        refs: job.refs,
        errors: job.items
          .filter((i) => i.status === 'failed')
          .slice(0, 25)
          .map((i) => `${i.label}: ${i.error ?? ''}`),
      };
      void this.deps.history
        .add(entry)
        .catch((error) => this.deps.log.warn('Could not save history', error));
    }
    this.deps.onJobFinished(job);
  }

  // ---------------------------------------------------------------- relay

  private async relayUrl(
    post: PostRef,
    source: { path: string; name: string },
    signal: AbortSignal,
  ): Promise<string | null> {
    const key = postKey(post);
    let cached = this.relays.get(key);
    if (!cached || this.now() - cached.at > RELAY_TTL_MS) {
      // Not tied to one item's signal: other files of the post wait on it too.
      const index = this.deps.client.getRelayIndex(post.service, post.creatorId, post.postId);
      cached = { index, at: this.now() };
      this.relays.set(key, cached);
      index.catch(() => {
        if (this.relays.get(key)?.index === index) this.relays.delete(key);
      });
    }
    if (signal.aborted) throw abortError(signal);
    const index = await cached.index;
    return findRelay(index, source, this.now())?.url ?? null;
  }

  // -------------------------------------------------------------- actions

  async act(jobId: string, action: JobAction): Promise<void> {
    const job = this.get(jobId);
    if (!job) return;
    switch (action) {
      case 'pause':
        if (FINISHED.has(job.status)) return;
        job.status = 'paused';
        this.stopActive(job, 'pause');
        this.resolving.get(job.id)?.abort();
        break;
      case 'resume':
        if (job.status !== 'paused') return;
        job.status = job.request ? 'resolving' : 'queued';
        if (job.request) void this.resolve(job);
        break;
      case 'cancel':
        if (FINISHED.has(job.status)) return;
        this.resolving.get(job.id)?.abort();
        job.status = 'cancelled';
        for (const item of job.items) if (item.status === 'pending') item.status = 'cancelled';
        this.stopActive(job, 'cancel');
        job.finishedAt = this.now();
        this.finalize(job);
        break;
      case 'retry':
        if (job.request) {
          job.status = 'resolving';
          job.error = undefined;
          void this.resolve(job);
          break;
        }
        for (const item of job.items) {
          if (item.status === 'failed' || item.status === 'cancelled') {
            item.status = 'pending';
            item.attempts = 0;
            item.error = undefined;
            item.notBefore = undefined;
          }
        }
        job.status = 'queued';
        job.finishedAt = undefined;
        job.error = undefined;
        break;
      case 'remove':
        if (!FINISHED.has(job.status)) {
          this.resolving.get(job.id)?.abort();
          job.status = 'cancelled';
          this.stopActive(job, 'cancel');
        }
        this.jobs = this.jobs.filter((j) => j.id !== jobId);
        break;
    }
    this.changed();
    this.persist(true);
    this.pump();
  }

  async actAll(action: 'pause' | 'resume'): Promise<void> {
    for (const job of [...this.jobs]) await this.act(job.id, action);
  }

  clearFinished(): void {
    this.jobs = this.jobs.filter((j) => !FINISHED.has(j.status));
    this.changed();
    this.persist(true);
  }

  private stopActive(job: Job, how: 'pause' | 'cancel'): void {
    for (const active of this.active.values()) {
      if (active.jobId !== job.id) continue;
      active.stopping = how;
      active.abort.abort(abortError());
      const item = job.items.find((i) => i.id === active.itemId);
      if (item?.downloadId !== undefined) {
        const id = item.downloadId;
        void this.deps.downloads.cancel(id).catch(() => undefined);
        this.waiters.get(id)?.resolve({
          id,
          state: 'interrupted',
          bytesReceived: 0,
          totalBytes: 0,
          error: 'USER_CANCELED',
        });
      }
    }
  }
}

/** The deepest folder shared by every path, for "open folder" hints. */
export function commonFolder(paths: readonly string[]): string {
  if (paths.length === 0) return '';
  const split = paths.map((p) => p.split('/').slice(0, -1));
  const first = split[0] as string[];
  let depth = first.length;
  for (const parts of split) {
    let i = 0;
    while (i < depth && parts[i] === first[i]) i++;
    depth = i;
  }
  return first.slice(0, depth).join('/');
}
