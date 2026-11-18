import { describe, expect, it } from 'vitest';
import full from '../fixtures/post-full.json';
import previewOnly from '../fixtures/post-preview-only.json';
import { normalizePost } from '../../src/lib/pawchive/normalize';
import {
  computeStats,
  DEFAULT_JOB_OPTIONS,
  hashesOf,
  optionsFromSettings,
  planPost,
} from '../../src/lib/jobs/plan';
import { DEFAULT_SETTINGS } from '../../src/lib/settings';
import type { FileItem, JobOptions, TextItem, ZipItem } from '../../src/lib/jobs/types';

const post = normalizePost(full);
const preview = normalizePost(previewOnly);
const creator = { service: 'patreon', id: '2581747', name: 'Histy' };
const now = new Date(2026, 10, 17);
const opts = (o: Partial<JobOptions> = {}): JobOptions => ({ ...DEFAULT_JOB_OPTIONS, ...o });

describe('optionsFromSettings', () => {
  it('copies settings and applies overrides', () => {
    const o = optionsFromSettings(
      { ...DEFAULT_SETTINGS, categories: { ...DEFAULT_SETTINGS.categories, video: false } },
      { mode: 'zip' },
    );
    expect(o.mode).toBe('zip');
    expect(o.categories).not.toContain('video');
    expect(o.categories).toContain('image');
  });
});

describe('planPost (individual)', () => {
  it('creates a file item per file plus the post text', () => {
    const items = planPost(post, creator, opts(), undefined, new Set(), now);
    const files = items.filter((i): i is FileItem => i.kind === 'file');
    const texts = items.filter((i): i is TextItem => i.kind === 'text');
    expect(files).toHaveLength(5);
    expect(texts.map((t) => t.label)).toEqual(['content.txt']);
    expect(files[0]!.path).toBe(
      'Pawchive/Histy (patreon)/2026-11-17 [RE4R] EARLY ACCESS_ Neverness to Everness - Elyms [175580645]/01_Screenshot (1790).png',
    );
    expect(texts[0]!.path.endsWith('[175580645]/content.txt')).toBe(true);
    expect(texts[0]!.text).toContain('This mod replaces Leon');
    expect(files.every((f) => f.status === 'pending')).toBe(true);
  });

  it('respects an explicit selection over categories', () => {
    const items = planPost(
      post,
      creator,
      opts({ categories: [], saveContent: 'none' }),
      [4],
      new Set(),
      now,
    );
    expect(items.map((i) => i.label)).toEqual(['Neverness to Everness - Elyms.rar']);
  });

  it('filters by category without a selection', () => {
    const items = planPost(
      post,
      creator,
      opts({ categories: ['video'], saveContent: 'none' }),
      undefined,
      new Set(),
      now,
    );
    expect(items.map((i) => i.label)).toEqual(['trailer.mp4']);
  });

  it('does not save the text again when every file was already downloaded', () => {
    const items = planPost(post, creator, opts(), undefined, new Set(hashesOf([post])), now);
    expect(items.every((i) => i.kind === 'file' && i.skipReason === 'duplicate')).toBe(true);
    const zip = planPost(
      post,
      creator,
      opts({ mode: 'zip' }),
      undefined,
      new Set(hashesOf([post])),
      now,
    );
    expect(zip.some((i) => i.kind === 'text' || i.kind === 'zip')).toBe(false);
  });

  it('skips files already downloaded', () => {
    const items = planPost(
      post,
      creator,
      opts({ saveContent: 'none' }),
      undefined,
      new Set(hashesOf([post]).slice(0, 2)),
      now,
    );
    expect(items.filter((i) => i.status === 'skipped').map((i) => i.skipReason)).toEqual([
      'duplicate',
      'duplicate',
    ]);
    const keep = planPost(
      post,
      creator,
      opts({ saveContent: 'none', skipDownloaded: false }),
      undefined,
      new Set(hashesOf([post])),
      now,
    );
    expect(keep.every((i) => i.status === 'pending')).toBe(true);
  });

  it('writes html content and metadata when asked', () => {
    const items = planPost(
      post,
      creator,
      opts({ saveContent: 'both', saveMetadata: true }),
      [],
      new Set(),
      now,
    ) as TextItem[];
    expect(items.map((i) => i.label)).toEqual(['content.txt', 'content.html', 'post.json']);
    expect(items[1]!.text).toContain(
      '<title>[RE4R] EARLY ACCESS: Neverness to Everness - Elyms</title>',
    );
    expect(JSON.parse(items[2]!.text).files).toHaveLength(5);
  });

  it('handles preview-only files per setting', () => {
    const relay = planPost(preview, null, opts(), undefined, new Set(), now) as FileItem[];
    expect(relay.every((i) => i.source.relay && i.source.url === null)).toBe(true);

    const thumbs = planPost(
      preview,
      null,
      opts({ previewOnly: 'thumbnail' }),
      undefined,
      new Set(),
      now,
    ) as FileItem[];
    expect(thumbs[0]!.label).toBe('001_preview.jpg');
    expect(thumbs[0]!.source.url).toMatch(/^https:\/\/img\.pawchive\.pw\/thumbnail/);
    // a zip has no thumbnail, so it is skipped
    expect(thumbs[2]!.status).toBe('skipped');

    const skipped = planPost(
      preview,
      null,
      opts({ previewOnly: 'skip' }),
      undefined,
      new Set(),
      now,
    );
    expect(skipped.every((i) => i.status === 'skipped' && i.skipReason === 'preview-only')).toBe(
      true,
    );
  });
});

describe('planPost (zip)', () => {
  it('bundles files into one archive and keeps videos apart', () => {
    const items = planPost(post, creator, opts({ mode: 'zip' }), undefined, new Set(), now);
    const zip = items[0] as ZipItem;
    expect(zip.kind).toBe('zip');
    expect(zip.path).toBe(
      'Pawchive/Histy (patreon)/Histy - 2026-11-17 [RE4R] EARLY ACCESS_ Neverness to Everness - Elyms [175580645].zip',
    );
    expect(zip.entries.map((e) => e.name)).toEqual([
      '01_Screenshot (1790).png',
      '02_Screenshot (1793).png',
      '03_word.png',
      '04_Neverness to Everness - Elyms.rar',
      'content.txt',
    ]);
    expect(items.slice(1).map((i) => i.label)).toEqual(['trailer.mp4']);
  });

  it('can include videos in the archive', () => {
    const items = planPost(
      post,
      creator,
      opts({ mode: 'zip', zipVideosSeparately: false, saveContent: 'none' }),
      undefined,
      new Set(),
      now,
    );
    expect(items).toHaveLength(1);
    expect((items[0] as ZipItem).entries).toHaveLength(5);
  });

  it('falls back to plain text files when nothing else is left', () => {
    const items = planPost(
      post,
      creator,
      opts({ mode: 'zip', categories: [] }),
      undefined,
      new Set(),
      now,
    );
    expect(items.map((i) => i.kind)).toEqual(['text']);
  });
});

describe('computeStats', () => {
  it('counts statuses and bytes', () => {
    const items = planPost(post, creator, opts({ saveContent: 'none' }), undefined, new Set(), now);
    items[0]!.status = 'done';
    items[0]!.bytes = 100;
    items[1]!.status = 'failed';
    items[2]!.status = 'active';
    items[2]!.bytes = 5;
    items[2]!.totalBytes = 50;
    items[3]!.status = 'cancelled';
    items[4]!.status = 'skipped';
    expect(computeStats(items)).toEqual({
      total: 5,
      done: 1,
      failed: 1,
      skipped: 1,
      cancelled: 1,
      active: 1,
      bytes: 105,
      totalBytes: 150,
      partial: 0.1,
    });
  });
});
