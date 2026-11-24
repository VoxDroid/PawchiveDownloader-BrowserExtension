import { vi } from 'vitest';
import { DownloadEngine, type DownloadSnapshot, type EngineDeps } from '../../src/lib/jobs/engine';
import type { Job } from '../../src/lib/jobs/types';
import { SiteLimiter } from '../../src/lib/net/limiter';
import type { PawchiveClient } from '../../src/lib/pawchive/client';
import type { Announcement, Comment } from '../../src/lib/pawchive/types';
import type { RelayIndex } from '../../src/lib/pawchive/relay';
import type { Post } from '../../src/lib/pawchive/types';
import { DEFAULT_SETTINGS, type Settings } from '../../src/lib/settings';
import type { FileRecord, HistoryEntry } from '../../src/lib/storage/db';

export interface FakeDownload {
  id: number;
  url: string;
  filename: string;
  state: DownloadSnapshot['state'];
  error?: string;
  bytes: number;
}

/** Stands in for browser.downloads; tests decide when transfers end. */
export class FakeDownloads {
  readonly all: FakeDownload[] = [];
  erased: number[] = [];
  cancelled: number[] = [];
  failStart: string | null = null;
  engine!: DownloadEngine;
  private nextId = 1;

  readonly port = {
    start: vi.fn(async ({ url, filename }: { url: string; filename: string }) => {
      if (this.failStart) throw new Error(this.failStart);
      const download: FakeDownload = {
        id: this.nextId++,
        url,
        filename,
        state: 'in_progress',
        bytes: 0,
      };
      this.all.push(download);
      return download.id;
    }),
    cancel: async (id: number) => {
      this.cancelled.push(id);
      const d = this.find(id);
      if (d) {
        d.state = 'interrupted';
        d.error = 'USER_CANCELED';
      }
    },
    erase: async (id: number) => {
      this.erased.push(id);
    },
    get: async (id: number): Promise<DownloadSnapshot | null> => {
      const d = this.find(id);
      return d
        ? { id, state: d.state, bytesReceived: d.bytes, totalBytes: d.bytes, error: d.error }
        : null;
    },
  };

  find(id: number): FakeDownload | undefined {
    return this.all.find((d) => d.id === id);
  }

  get running(): FakeDownload[] {
    return this.all.filter((d) => d.state === 'in_progress');
  }

  finish(id: number, bytes = 100): void {
    const d = this.find(id);
    if (!d) throw new Error(`no download ${id}`);
    d.state = 'complete';
    d.bytes = bytes;
    this.engine.onDownloadChanged(id, 'complete');
  }

  fail(id: number, error: string): void {
    const d = this.find(id);
    if (!d) throw new Error(`no download ${id}`);
    d.state = 'interrupted';
    d.error = error;
    this.engine.onDownloadChanged(id, 'interrupted', error);
  }

  finishAll(): void {
    for (const d of this.running) this.finish(d.id);
  }
}

export interface HarnessOptions {
  settings?: Partial<Settings>;
  known?: string[];
  saved?: Job[];
  posts?: Post[];
  relay?: RelayIndex;
  creatorName?: string;
  comments?: Comment[];
  announcements?: Announcement[];
}

export function createHarness(options: HarnessOptions = {}) {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...options.settings };
  const downloads = new FakeDownloads();
  let saved: Job[] = options.saved ?? [];
  const history: HistoryEntry[] = [];
  const recorded: string[] = [];
  const records: FileRecord[] = [];
  const revoked: string[] = [];
  let ids = 1;
  const posts = options.posts ?? [];

  const client = {
    getPost: vi.fn(async (_s: string, _c: string, postId: string) => {
      const post = posts.find((p) => p.id === postId);
      if (!post) throw new Error(`HTTP 404 ${postId}`);
      return post;
    }),
    getCreator: vi.fn(async (service: string, id: string) => ({
      service,
      id,
      name: options.creatorName ?? 'Histy',
      publicId: null,
      url: '',
      iconUrl: '',
      bannerUrl: '',
      updated: null,
    })),
    getAllCreatorPosts: vi.fn(
      async (
        _s: string,
        _c: string,
        o: {
          onProgress?: (p: { pages: number; posts: number; offset: number }, page: Post[]) => void;
          stopWhen?: (page: Post[]) => boolean;
        } = {},
      ) => {
        o.onProgress?.({ pages: 1, posts: posts.length, offset: 0 }, posts);
        o.stopWhen?.(posts);
        return posts;
      },
    ),
    getRelayIndex: vi.fn(async () => options.relay ?? { byPath: new Map(), byName: new Map() }),
    getComments: vi.fn(async () => options.comments ?? []),
    getAnnouncements: vi.fn(async () => options.announcements ?? []),
  };

  const zip = {
    run: vi.fn(async () => ({
      parts: [{ url: 'blob:zip-1', size: 4096, revoke: () => revoked.push('blob:zip-1') }],
      failed: [] as Array<{ name: string; error: string }>,
      deferred: [] as Array<{ name: string; url: string; size: number }>,
    })),
  };

  const onFinished = vi.fn();
  const deps: EngineDeps = {
    client: client as unknown as PawchiveClient,
    limiter: new SiteLimiter({
      maxActive: 5,
      minIntervalMs: 0,
      policy: { resumeSpreadMs: 0, minCooldownMs: 10, backoffBaseMs: 10, backoffCapMs: 40 },
    }),
    downloads: downloads.port,
    zip: zip as unknown as EngineDeps['zip'],
    textUrl: async (text: string) => ({
      url: `data:text/plain,${encodeURIComponent(text.slice(0, 10))}`,
      revoke: () => revoked.push('text'),
    }),
    settings: () => settings,
    store: {
      load: async () => structuredClone(saved),
      save: async (jobs) => {
        saved = structuredClone(jobs);
      },
    },
    history: {
      knownHashes: async (hashes) => new Set(hashes.filter((h) => options.known?.includes(h))),
      record: async (files) => {
        recorded.push(...files.map((f) => f.hash));
        records.push(...files);
      },
      add: async (entry) => {
        history.push(entry);
      },
    },
    log: {
      debug() {},
      info() {},
      warn() {},
      error() {},
      scope() {
        return this;
      },
    },
    onChange: () => undefined,
    onJobFinished: onFinished,
    newId: () => `job-${ids++}`,
  };
  const engine = new DownloadEngine(deps);
  downloads.engine = engine;
  return {
    engine,
    downloads,
    client,
    zip,
    history,
    recorded,
    records,
    revoked,
    settings,
    onFinished,
    saved: () => saved,
  };
}

/** Lets pending promises and zero-delay timers run. */
export async function settle(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await vi.advanceTimersByTimeAsync(0);
  }
}
