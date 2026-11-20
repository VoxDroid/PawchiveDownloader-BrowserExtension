import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import full from '../fixtures/post-full.json';
import {
  announcementsText,
  commentsText,
  creatorFolder,
  DEFAULT_JOB_OPTIONS,
  planPost,
} from '../../src/lib/jobs/plan';
import type { FileItem, Job, TextItem } from '../../src/lib/jobs/types';
import { normalizePost } from '../../src/lib/pawchive/normalize';
import { createHarness, settle } from '../helpers/engine-harness';

const post = normalizePost(full);
const creator = { service: 'patreon', id: '2581747', name: 'Histy' };
const withLinks = {
  ...post,
  links: ['https://mega.nz/folder/abc#key'],
  passwords: ['cat123'],
};

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
  });
  vi.setSystemTime(new Date(1794933059 * 1000 - 3_600_000));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('planning what the desktop app saves', () => {
  it('writes links.txt with the outside links and passwords', () => {
    const items = planPost(withLinks, creator, DEFAULT_JOB_OPTIONS, []);
    const links = items.find((i) => i.label === 'links.txt') as TextItem;
    expect(links.text).toContain('https://mega.nz/folder/abc#key');
    expect(links.text).toContain('Passwords\ncat123');
    // Off: no file.
    const none = planPost(withLinks, creator, { ...DEFAULT_JOB_OPTIONS, saveLinks: false }, []);
    expect(none.some((i) => i.label === 'links.txt')).toBe(false);
  });

  it('puts links.txt inside the archive in ZIP mode', () => {
    const items = planPost(withLinks, creator, { ...DEFAULT_JOB_OPTIONS, mode: 'zip' }, undefined);
    const zip = items.find((i) => i.kind === 'zip');
    expect(zip && 'entries' in zip && zip.entries.some((e) => e.name === 'links.txt')).toBe(true);
  });

  it('plans a comments file that is fetched when it runs', () => {
    const items = planPost(post, creator, { ...DEFAULT_JOB_OPTIONS, saveComments: true }, [1]);
    const comments = items.find((i) => i.label === 'comments.txt') as TextItem;
    expect(comments).toMatchObject({ kind: 'text', fetch: 'comments', text: '' });
    expect(comments.path.endsWith('/comments.txt')).toBe(true);
  });

  it('keeps a thumbnail to fall back to for full files only', () => {
    const items = planPost(post, creator, DEFAULT_JOB_OPTIONS, undefined);
    const image = items.find((i) => i.kind === 'file' && i.category === 'image') as FileItem;
    expect(image.thumbnail).toMatch(/^https:\/\/img\.pawchive\.pw\/thumbnail\/data\//);
  });

  it('puts announcements in the creator folder', () => {
    expect(creatorFolder(DEFAULT_JOB_OPTIONS, creator, new Date())).toBe(
      'Pawchive/Histy (patreon)',
    );
    expect(
      creatorFolder(
        { ...DEFAULT_JOB_OPTIONS, folderTemplate: '{site}/{creator}/{title}' },
        { ...creator, service: 'fanbox@kemono' },
        new Date(),
      ),
    ).toBe('Kemono/Histy');
  });

  it('writes comments with replies under their parent, like the app', () => {
    const text = commentsText('Post', 'https://x', [
      {
        id: '1',
        parentId: null,
        author: 'Ann',
        content: '<p>Hi</p>',
        published: '2026-01-01T10:00:00',
      },
      { id: '2', parentId: '1', author: 'Bob', content: 'Re', published: null },
      { id: '3', parentId: '99', author: 'Cy', content: 'Orphan', published: null },
    ]);
    expect(text).toBe(
      'Comments on Post\nhttps://x\n\nAnn  2026-01-01 10:00:00\nHi\n\n    Bob  \n    Re\n\nCy  \nOrphan\n',
    );
    expect(
      announcementsText('Cat', [{ content: '<p>News</p>', published: '2026-02-03T04:05:06' }]),
    ).toBe('Announcements by Cat\n\n2026-02-03 04:05:06\nNews\n\n----\n');
  });
});

describe('the engine with the new items', () => {
  it('fetches comments, and skips the file when there are none', async () => {
    const h = createHarness({
      settings: { saveContent: 'none', saveComments: true, saveLinks: false },
      comments: [{ id: '1', parentId: null, author: 'Ann', content: 'Nice', published: null }],
    });
    await h.engine.init();
    const id = await h.engine.create({
      kind: 'posts',
      creator,
      posts: [{ post, fileIndexes: [] }],
    });
    await settle();
    h.downloads.finishAll();
    await settle();
    const job = h.engine.get(id) as Job;
    const comments = job.items.find((i) => i.label === 'comments.txt') as TextItem;
    expect(comments.status).toBe('done');
    expect(comments.text).toContain('Ann');
    expect(h.client.getComments).toHaveBeenCalledWith(
      'patreon',
      post.creatorId,
      post.id,
      expect.anything(),
    );

    const empty = createHarness({ settings: { saveContent: 'none', saveComments: true } });
    await empty.engine.init();
    const id2 = await empty.engine.create({
      kind: 'posts',
      creator,
      posts: [{ post, fileIndexes: [] }],
    });
    await settle();
    const item = empty.engine.get(id2)!.items.find((i) => i.label === 'comments.txt')!;
    expect(item).toMatchObject({ status: 'skipped', skipReason: 'empty' });
  });

  it('saves announcements once per job', async () => {
    const h = createHarness({
      settings: { saveContent: 'none', saveAnnouncements: true, saveLinks: false },
      announcements: [{ content: 'Hello', published: null }],
    });
    await h.engine.init();
    const id = await h.engine.create({
      kind: 'posts',
      creator,
      posts: [
        { post, fileIndexes: [] },
        { post: { ...post, id: 'other' }, fileIndexes: [] },
      ],
    });
    await settle();
    h.downloads.finishAll();
    await settle();
    const job = h.engine.get(id) as Job;
    const announcements = job.items.filter((i) => i.label === 'announcements.txt');
    expect(announcements).toHaveLength(1);
    expect(announcements[0]).toMatchObject({
      status: 'done',
      path: 'Pawchive/Histy (patreon)/announcements.txt',
    });
  });

  it('saves the thumbnail once a full file keeps failing', async () => {
    const h = createHarness({ settings: { maxRetries: 0, saveContent: 'none', saveLinks: false } });
    await h.engine.init();
    const id = await h.engine.create({
      kind: 'posts',
      creator,
      posts: [{ post, fileIndexes: [1] }],
    });
    await settle();
    h.downloads.fail(h.downloads.running[0]!.id, 'SERVER_FAILED');
    await settle();
    const item = h.engine.get(id)!.items[0] as FileItem;
    // It starts again right away, as its thumbnail.
    expect(item).toMatchObject({ status: 'active', fallback: true, hash: null });
    expect(item.path).toMatch(/_preview\.[a-z]+$/);
    expect(item.source.url).toBe(item.thumbnail);
    await vi.advanceTimersByTimeAsync(100);
    await settle();
    h.downloads.finishAll();
    await settle();
    expect(h.engine.get(id)!.status).toBe('done');
    // A thumbnail is not the file: its hash is not remembered as downloaded.
    expect(h.recorded).toHaveLength(0);
  });

  it('does not fall back on disk errors', async () => {
    const h = createHarness({ settings: { saveContent: 'none', saveLinks: false } });
    await h.engine.init();
    const id = await h.engine.create({
      kind: 'posts',
      creator,
      posts: [{ post, fileIndexes: [1] }],
    });
    await settle();
    h.downloads.fail(h.downloads.running[0]!.id, 'FILE_NO_SPACE');
    await settle();
    expect(h.engine.get(id)!.items[0]).toMatchObject({ status: 'failed', error: 'FILE_NO_SPACE' });
  });

  it('tries failed files again by itself, up to the limit', async () => {
    const h = createHarness({
      settings: { maxRetries: 0, saveContent: 'none', saveLinks: false, thumbnailFallback: false },
    });
    await h.engine.init();
    const id = await h.engine.create({
      kind: 'posts',
      creator,
      posts: [{ post, fileIndexes: [1] }],
    });
    await settle();
    h.downloads.fail(h.downloads.running[0]!.id, 'SERVER_FAILED');
    await settle();
    const job = h.engine.get(id) as Job;
    expect(job.status).toBe('failed');

    // Too early: nothing happens.
    expect(h.engine.autoRetry(60_000, 2)).toBe(0);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(h.engine.autoRetry(60_000, 2)).toBe(1);
    await settle();
    expect(job.status).toBe('running');
    expect(job.items[0]).toMatchObject({ status: 'active', autoRetries: 1, attempts: 0 });

    // Fail twice more: the second automatic retry is the last.
    h.downloads.fail(h.downloads.running[0]!.id, 'SERVER_FAILED');
    await settle();
    await vi.advanceTimersByTimeAsync(61_000);
    expect(h.engine.autoRetry(60_000, 2)).toBe(1);
    await settle();
    h.downloads.fail(h.downloads.running[0]!.id, 'SERVER_FAILED');
    await settle();
    await vi.advanceTimersByTimeAsync(61_000);
    expect(h.engine.autoRetry(60_000, 2)).toBe(0);
    expect(job.items[0]).toMatchObject({ status: 'failed', autoRetries: 2 });
  });
});
