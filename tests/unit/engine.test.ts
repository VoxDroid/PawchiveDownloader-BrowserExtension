import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import full from '../fixtures/post-full.json';
import previewOnly from '../fixtures/post-preview-only.json';
import { commonFolder } from '../../src/lib/jobs/engine';
import { DEFAULT_JOB_OPTIONS } from '../../src/lib/jobs/plan';
import type { FileItem, Job } from '../../src/lib/jobs/types';
import { normalizePost } from '../../src/lib/pawchive/normalize';
import { parseRelayLinks } from '../../src/lib/pawchive/relay';
import relayHtml from '../fixtures/post-preview-only.html?raw';
import { createHarness, settle } from '../helpers/engine-harness';

const post = normalizePost(full);
const preview = normalizePost(previewOnly);
const creator = { service: 'patreon', id: '2581747', name: 'Histy' };

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
  });
  vi.setSystemTime(new Date(1794933059 * 1000 - 3_600_000));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DownloadEngine: individual files', () => {
  it('downloads every file and the post text, then records history', async () => {
    const h = createHarness({ settings: { concurrency: 3 } });
    await h.engine.init();
    const id = await h.engine.create({ kind: 'posts', creator, posts: [{ post }] });
    await settle();

    // Five files plus content.txt, three at a time.
    expect(h.downloads.running).toHaveLength(3);
    expect(h.engine.list()[0]).toMatchObject({ id, status: 'running', mode: 'individual' });

    for (let round = 0; round < 4 && h.downloads.running.length; round++) {
      h.downloads.finishAll();
      await settle();
    }
    expect(h.downloads.all).toHaveLength(6);
    const job = h.engine.get(id) as Job;
    expect(job.status).toBe('done');
    expect(job.items.every((i) => i.status === 'done')).toBe(true);
    expect(h.history).toHaveLength(1);
    expect(h.history[0]).toMatchObject({
      status: 'done',
      files: { done: 6, failed: 0, skipped: 0 },
    });
    expect(h.history[0]!.folder).toBe(
      'Pawchive/Histy (patreon)/2026-11-17 [RE4R] EARLY ACCESS_ Neverness to Everness - Elyms [175580645]',
    );
    expect(h.recorded).toHaveLength(5);
    expect(h.onFinished).toHaveBeenCalledOnce();
    expect(h.revoked).toContain('text');
    expect(h.engine.busy).toBe(false);
  });

  it('retries network failures with backoff and gives up on fatal errors', async () => {
    const h = createHarness({ settings: { concurrency: 2, maxRetries: 2, saveContent: 'none' } });
    await h.engine.init();
    const id = await h.engine.create({
      kind: 'posts',
      creator,
      posts: [{ post, fileIndexes: [1, 2] }],
    });
    await settle();
    const [first, second] = h.downloads.running;
    h.downloads.fail(first!.id, 'NETWORK_FAILED');
    h.downloads.fail(second!.id, 'FILE_NO_SPACE');
    await settle();

    const job = h.engine.get(id) as Job;
    expect(job.items[0]).toMatchObject({ status: 'pending', attempts: 1, error: 'NETWORK_FAILED' });
    expect(job.items[1]).toMatchObject({ status: 'failed', error: 'FILE_NO_SPACE' });
    expect(h.downloads.erased).toEqual([first!.id, second!.id]);

    await vi.advanceTimersByTimeAsync(100);
    await settle();
    expect(h.downloads.running).toHaveLength(1);
    h.downloads.finishAll();
    await settle();
    expect(job.status).toBe('done');
    expect(h.history[0]!.files).toEqual({ done: 1, failed: 1, skipped: 0 });
  });

  it('fails a job whose every file failed and reports invalid names at once', async () => {
    const h = createHarness({ settings: { saveContent: 'none' } });
    h.downloads.failStart = 'Invalid filename';
    await h.engine.init();
    const id = await h.engine.create({
      kind: 'posts',
      creator,
      posts: [{ post, fileIndexes: [1] }],
    });
    await settle();
    expect(h.engine.get(id)!.status).toBe('failed');
    expect(h.engine.get(id)!.items[0]!.error).toBe('Invalid filename');
  });

  it('stops retrying after the configured number of attempts', async () => {
    const h = createHarness({
      settings: { maxRetries: 1, saveContent: 'none', thumbnailFallback: false },
    });
    await h.engine.init();
    const id = await h.engine.create({
      kind: 'posts',
      creator,
      posts: [{ post, fileIndexes: [1] }],
    });
    for (let i = 0; i < 2; i++) {
      await settle();
      h.downloads.fail(h.downloads.running[0]!.id, 'SERVER_FAILED');
      await settle();
      await vi.advanceTimersByTimeAsync(200);
    }
    await settle();
    expect(h.engine.get(id)!.items[0]).toMatchObject({ status: 'failed', attempts: 2 });
  });

  it('treats a download cancelled in the browser as cancelled', async () => {
    const h = createHarness({ settings: { saveContent: 'none' } });
    await h.engine.init();
    const id = await h.engine.create({
      kind: 'posts',
      creator,
      posts: [{ post, fileIndexes: [1] }],
    });
    await settle();
    h.downloads.fail(h.downloads.running[0]!.id, 'USER_CANCELED');
    await settle();
    expect(h.engine.get(id)!.items[0]!.status).toBe('cancelled');
  });

  it('skips files already downloaded', async () => {
    const known = post.files.map((f) => f.hash!).slice(0, 4);
    const h = createHarness({ known, settings: { saveContent: 'none' } });
    await h.engine.init();
    const id = await h.engine.create({ kind: 'posts', creator, posts: [{ post }] });
    await settle();
    const job = h.engine.get(id)!;
    expect(job.items.filter((i) => i.status === 'skipped')).toHaveLength(4);
    expect(h.downloads.all).toHaveLength(1);
  });

  it('downloads a file shared by two posts only once', async () => {
    const twin = { ...post, id: 'twin', files: post.files.slice(0, 1) };
    const h = createHarness({ settings: { saveContent: 'none' } });
    await h.engine.init();
    const id = await h.engine.create({
      kind: 'posts',
      creator,
      posts: [{ post, fileIndexes: [1] }, { post: twin }],
    });
    await settle();
    const job = h.engine.get(id)!;
    expect(job.items.map((i) => i.status)).toEqual(['active', 'skipped']);
    expect(job.postCount).toBe(2);
  });
});

describe('DownloadEngine: preview-only files', () => {
  it('fetches full files through the relay links of the post page', async () => {
    const h = createHarness({ relay: parseRelayLinks(relayHtml), settings: { concurrency: 5 } });
    await h.engine.init();
    const id = await h.engine.create({ kind: 'posts', posts: [{ post: preview }] });
    await settle();
    expect(h.client.getRelayIndex).toHaveBeenCalledOnce();
    expect(h.downloads.all.map((d) => new URL(d.url).hostname)).toEqual([
      't4.pawchive.pw',
      't2.pawchive.pw',
      't1.pawchive.pw',
    ]);
    h.downloads.finishAll();
    await settle();
    expect(h.engine.get(id)!.status).toBe('done');
  });

  it('skips preview-only files without a relay link', async () => {
    const h = createHarness();
    await h.engine.init();
    const id = await h.engine.create({ kind: 'posts', posts: [{ post: preview }] });
    await settle();
    const job = h.engine.get(id)!;
    expect(job.items.every((i) => i.status === 'skipped' && i.skipReason === 'no-relay')).toBe(
      true,
    );
    expect(job.status).toBe('done');
  });
});

describe('DownloadEngine: looking up posts', () => {
  it('resolves post references', async () => {
    const h = createHarness({ posts: [post], settings: { saveContent: 'none' } });
    await h.engine.init();
    const id = await h.engine.create({
      kind: 'refs',
      refs: [
        { service: 'patreon', creatorId: '2581747', postId: post.id },
        { service: 'patreon', creatorId: '2581747', postId: 'gone' },
      ],
    });
    await settle();
    const job = h.engine.get(id)!;
    expect(job.status).toBe('running');
    expect(job.title).toBe(post.title);
    expect(job.creator?.name).toBe('Histy');
    expect(job.items).toHaveLength(5);
    expect(job.scan).toMatchObject({ posts: 2, matched: 1 });
  });

  it('resolves a creator, keeping only the wanted and newer posts', async () => {
    const older = { ...post, id: 'old', published: '2020-01-01T00:00:00' };
    const other = { ...post, id: 'other' };
    const h = createHarness({ posts: [post, other, older], settings: { saveContent: 'none' } });
    await h.engine.init();
    const id = await h.engine.create({
      kind: 'creator',
      service: 'patreon',
      creatorId: '2581747',
      postIds: [post.id, 'old'],
      since: '2021-01-01',
    });
    await settle();
    const job = h.engine.get(id)!;
    expect(job.title).toBe('Histy');
    expect(job.refs.map((r) => r.postId)).toEqual([post.id]);
    expect(job.scan?.matched).toBe(1);
  });

  it('finishes with a note when nothing matched', async () => {
    const h = createHarness({ posts: [] });
    await h.engine.init();
    const id = await h.engine.create({ kind: 'creator', service: 'patreon', creatorId: '1' });
    await settle();
    expect(h.engine.get(id)).toMatchObject({ status: 'done', error: 'nothing-found' });
  });

  it('fails when the creator cannot be loaded', async () => {
    const h = createHarness();
    h.client.getAllCreatorPosts.mockRejectedValueOnce(new Error('HTTP 500'));
    await h.engine.init();
    const id = await h.engine.create({ kind: 'creator', service: 'patreon', creatorId: '1' });
    await settle();
    expect(h.engine.get(id)).toMatchObject({ status: 'failed', error: 'HTTP 500' });
    // Retrying looks the posts up again.
    await h.engine.act(id, 'retry');
    await settle();
    expect(h.client.getAllCreatorPosts).toHaveBeenCalledTimes(2);
  });
});

describe('DownloadEngine: ZIP archives', () => {
  it('builds one archive per post and saves oversized files beside it', async () => {
    const h = createHarness({ settings: { downloadMode: 'zip' } });
    h.zip.run.mockResolvedValueOnce({
      parts: [
        { url: 'blob:a', size: 10, revoke: () => h.revoked.push('blob:a') },
        { url: 'blob:b', size: 20, revoke: () => h.revoked.push('blob:b') },
      ],
      failed: [{ name: '02_Screenshot (1793).png', error: 'HTTP 404' }],
      deferred: [
        {
          name: '04_Neverness to Everness - Elyms.rar',
          url: 'https://n4.pawchive.pw/data/x.rar',
          size: 5e8,
        },
      ],
    });
    await h.engine.init();
    const id = await h.engine.create({ kind: 'posts', creator, posts: [{ post }] });
    await settle();
    expect(h.zip.run).toHaveBeenCalledOnce();
    const spec = (h.zip.run.mock.calls[0] as unknown[])[0] as {
      entries: Array<{ name: string }>;
      maxPartBytes: number;
    };
    expect(spec.entries.map((e) => e.name)).toContain('content.txt');
    expect(spec.maxPartBytes).toBe(2048 * 1024 * 1024);

    // The video goes beside the archive from the start; the parts follow one by one.
    for (let round = 0; round < 6 && h.downloads.running.length; round++) {
      h.downloads.finishAll();
      await settle();
    }
    const names = h.downloads.all.map((d) => d.filename.split('/').pop());
    expect(names).toContain('05_trailer.mp4');
    expect(names.some((n) => n?.endsWith('(part 1 of 2).zip'))).toBe(true);
    expect(names.some((n) => n?.endsWith('(part 2 of 2).zip'))).toBe(true);
    expect(names).toContain('04_Neverness to Everness - Elyms.rar');
    const job = h.engine.get(id)!;
    expect(job.status).toBe('done');
    const zipItem = job.items.find((i) => i.kind === 'zip');
    expect(zipItem).toMatchObject({
      parts: 2,
      failedEntries: ['02_Screenshot (1793).png: HTTP 404'],
    });
    expect(h.revoked).toEqual(expect.arrayContaining(['blob:a', 'blob:b']));
    // Files missing from the archive are not remembered as downloaded.
    expect(h.recorded).not.toContain(post.files[1]!.hash);
  });
});

describe('DownloadEngine: job actions', () => {
  it('pauses, resumes, cancels and removes jobs', async () => {
    const h = createHarness({ settings: { concurrency: 2, saveContent: 'none' } });
    await h.engine.init();
    const id = await h.engine.create({ kind: 'posts', creator, posts: [{ post }] });
    await settle();
    expect(h.downloads.running).toHaveLength(2);

    await h.engine.act(id, 'pause');
    await settle();
    const job = h.engine.get(id)!;
    expect(job.status).toBe('paused');
    expect(job.items.every((i) => i.status === 'pending')).toBe(true);
    expect(h.downloads.cancelled).toHaveLength(2);

    await h.engine.act(id, 'resume');
    await settle();
    expect(job.status).toBe('running');
    expect(h.downloads.running).toHaveLength(2);

    await h.engine.act(id, 'cancel');
    await settle();
    expect(job.status).toBe('cancelled');
    expect(job.items.every((i) => i.status === 'cancelled')).toBe(true);
    expect(h.history.at(-1)?.status).toBe('cancelled');

    await h.engine.act(id, 'retry');
    await settle();
    expect(job.status).toBe('running');

    await h.engine.act(id, 'remove');
    expect(h.engine.get(id)).toBeUndefined();
    await h.engine.act('missing', 'pause');
  });

  it('pauses and resumes everything, and clears finished jobs', async () => {
    const h = createHarness({ settings: { saveContent: 'none' } });
    await h.engine.init();
    const a = await h.engine.create({ kind: 'posts', posts: [{ post, fileIndexes: [1] }] });
    const b = await h.engine.create({
      kind: 'posts',
      posts: [{ post: { ...post, id: 'b' }, fileIndexes: [1] }],
    });
    await settle();
    await h.engine.actAll('pause');
    expect(h.engine.list().map((j) => j.status)).toEqual(['paused', 'paused']);
    await h.engine.actAll('resume');
    await settle();
    h.downloads.finishAll();
    await settle();
    expect(h.engine.get(a)?.status).toBe('done');
    expect(h.engine.get(b)?.status).toBe('done');
    h.engine.clearFinished();
    expect(h.engine.list()).toEqual([]);
  });

  it('tracks bytes and speed of running downloads', async () => {
    const h = createHarness({ settings: { saveContent: 'none' } });
    await h.engine.init();
    await h.engine.create({ kind: 'posts', posts: [{ post, fileIndexes: [1] }] });
    await settle();
    h.downloads.running[0]!.bytes = 1000;
    await h.engine.refreshProgress();
    vi.advanceTimersByTime(1000);
    h.downloads.running[0]!.bytes = 3000;
    await h.engine.refreshProgress();
    const summary = h.engine.list()[0]!;
    expect(summary.stats.bytes).toBe(3000);
    expect(summary.current).toEqual(['Screenshot (1790).png']);
  });
});

describe('DownloadEngine: restarts', () => {
  function savedJob(state: 'complete' | 'in_progress' | 'none'): Job {
    const item: FileItem = {
      id: `${post.id}:1`,
      kind: 'file',
      post: { service: 'patreon', creatorId: '2581747', postId: post.id },
      label: 'a.png',
      path: 'Pawchive/a.png',
      status: 'active',
      attempts: 0,
      bytes: 0,
      totalBytes: 0,
      source: {
        url: 'https://n1.pawchive.pw/data/a.png',
        relay: false,
        path: '/a.png',
        name: 'a.png',
      },
      hash: 'h',
      category: 'image',
      downloadId: state === 'none' ? undefined : 99,
    };
    return {
      id: 'saved',
      createdAt: 0,
      title: 'Saved',
      subtitle: '',
      creator: null,
      status: 'running',
      options: { ...DEFAULT_JOB_OPTIONS },
      postCount: 1,
      items: [item],
      refs: [],
    };
  }

  it('marks downloads that completed while the worker slept as done', async () => {
    const job = savedJob('complete');
    const h = createHarness({ saved: [job] });
    h.downloads.all.push({ id: 99, url: '', filename: '', state: 'complete', bytes: 50 });
    await h.engine.init();
    expect(h.engine.get('saved')).toMatchObject({ status: 'done' });
    expect(h.engine.get('saved')!.items[0]).toMatchObject({ status: 'done', bytes: 50 });
  });

  it('reattaches to downloads still running and restarts lost ones', async () => {
    const running = savedJob('in_progress');
    const lost = { ...savedJob('none'), id: 'lost' };
    const h = createHarness({ saved: [running, lost] });
    h.downloads.all.push({ id: 99, url: '', filename: '', state: 'in_progress', bytes: 0 });
    await h.engine.init();
    await settle();
    h.downloads.finish(99);
    await settle();
    expect(h.engine.get('saved')!.status).toBe('done');
    // The item that was mid-flight without a browser download starts again.
    expect(h.downloads.all.filter((d) => d.id !== 99)).toHaveLength(1);
  });
});

describe('commonFolder', () => {
  it('finds the deepest shared folder', () => {
    expect(commonFolder(['a/b/c/1.png', 'a/b/c/2.png'])).toBe('a/b/c');
    expect(commonFolder(['a/b/1.png', 'a/c/2.png'])).toBe('a');
    expect(commonFolder(['1.png'])).toBe('');
    expect(commonFolder([])).toBe('');
  });
});
