/**
 * Stress tests: far more posts, failures and hostile input than real use,
 * checking that nothing gets stuck, lost, duplicated or slow.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppBridge, EMPTY_BRIDGE, type BridgeState } from '../../src/lib/bridge';
import type { Job } from '../../src/lib/jobs/types';
import { fileHostLinks, findPasswords } from '../../src/lib/pawchive/links';
import { normalizePost } from '../../src/lib/pawchive/normalize';
import { extractPageLinks, parsePageUrl } from '../../src/lib/pawchive/urls';
import type { Post } from '../../src/lib/pawchive/types';
import { createHarness, settle } from '../helpers/engine-harness';

/** A small deterministic random generator, so failures are reproducible. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function hash(n: number): string {
  return n.toString(16).padStart(64, '0');
}

function makePosts(count: number, filesEach: number): Post[] {
  const posts: Post[] = [];
  let fileNo = 0;
  for (let p = 0; p < count; p++) {
    const files = [];
    for (let f = 0; f < filesEach; f++) {
      // Every tenth post repeats a file of the previous post (shared files).
      const n = f === 0 && p % 10 === 9 ? fileNo - filesEach : fileNo++;
      files.push({
        path: `/aa/bb/${hash(n)}.png`,
        name: `f${n}.png`,
        server: 'https://n1.pawchive.pw',
      });
    }
    posts.push(
      normalizePost({
        id: String(1_000_000 + p),
        user: '7',
        service: p % 3 === 0 ? 'patreon' : 'fanbox',
        title: `Post ${p}`,
        content: '',
        file: files[0]!,
        attachments: files.slice(1),
      }),
    );
  }
  return posts;
}

describe('the engine under load', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('settles 7,500 files with random failures: nothing stuck, lost or fetched twice', async () => {
    const rnd = random(42);
    const posts = makePosts(1500, 5);
    const h = createHarness({
      settings: {
        concurrency: 5,
        maxRetries: 2,
        saveContent: 'none',
        saveLinks: false,
        thumbnailFallback: false,
      },
    });
    await h.engine.init();
    // Real time: performance.now() is faked along with the timers here.
    const started = process.hrtime.bigint();
    const id = await h.engine.create({
      kind: 'posts',
      creator: { service: 'patreon', id: '7', name: 'Load' },
      posts: posts.map((post) => ({ post })),
    });
    const job = h.engine.get(id) as Job;
    expect(job.items).toHaveLength(7500);
    // Files shared between posts are planned once and skipped after that.
    const skipped = job.items.filter((i) => i.status === 'skipped').length;
    expect(skipped).toBe(150);

    let rounds = 0;
    while (job.status === 'running' || job.status === 'queued') {
      rounds += 1;
      expect(rounds).toBeLessThan(20_000);
      await settle();
      const running = [...h.downloads.running];
      if (running.length === 0) {
        // Everything left is waiting out a retry backoff.
        await vi.advanceTimersByTimeAsync(200);
        continue;
      }
      for (const d of running) {
        const roll = rnd();
        if (roll < 0.08) h.downloads.fail(d.id, 'NETWORK_FAILED');
        else if (roll < 0.1) h.downloads.fail(d.id, 'SERVER_FAILED');
        else if (roll < 0.102) h.downloads.fail(d.id, 'FILE_NO_SPACE');
        else h.downloads.finish(d.id);
      }
    }
    await settle();

    expect(['done', 'failed']).toContain(job.status);
    // Every item reached a final state.
    const open = job.items.filter((i) => i.status === 'pending' || i.status === 'active');
    expect(open).toHaveLength(0);
    // No file was saved twice, and the counts add up.
    const saved = h.downloads.all.filter((d) => d.state === 'complete').map((d) => d.filename);
    expect(new Set(saved).size).toBe(saved.length);
    const stats = h.engine.list()[0]!.stats;
    expect(stats.done + stats.failed + stats.skipped).toBe(stats.total);
    expect(stats.done).toBe(saved.length);
    // Retries never exceed the setting.
    expect(Math.max(...job.items.map((i) => i.attempts))).toBeLessThanOrEqual(3);
    // One history entry, and the planning itself stays fast.
    expect(h.history).toHaveLength(1);
    expect(Number(process.hrtime.bigint() - started) / 1e6).toBeLessThan(60_000);
  }, 120_000);

  it('handles a hundred jobs queued at once', async () => {
    const h = createHarness({
      settings: { concurrency: 5, saveContent: 'none', saveLinks: false },
    });
    await h.engine.init();
    const posts = makePosts(100, 2);
    const ids: string[] = [];
    for (const post of posts) ids.push(await h.engine.create({ kind: 'posts', posts: [{ post }] }));
    for (let i = 0; i < 400 && h.downloads.running.length; i++) {
      h.downloads.finishAll();
      await settle();
    }
    const statuses = new Set(ids.map((id) => h.engine.get(id)!.status));
    expect(statuses).toEqual(new Set(['done']));
    expect(h.engine.busy).toBe(false);
  }, 60_000);
});

describe('hostile text', () => {
  it('finds links and passwords in huge and nasty input quickly', () => {
    const nasty = [
      'pass'.repeat(50_000),
      'password: '.repeat(20_000),
      `<a href="${'https://mega.nz/'.repeat(5_000)}">x</a>`,
      `${'<p>'.repeat(20_000)}https://drive.google.com/file/d/abc${'</p>'.repeat(20_000)}`,
      `https://${'a.'.repeat(30_000)}mega.nz/x`,
      'パスワード：'.repeat(20_000),
    ];
    for (const text of nasty) {
      const started = performance.now();
      const links = fileHostLinks(text);
      const passwords = findPasswords(text);
      expect(performance.now() - started).toBeLessThan(2_000);
      expect(links.length).toBeLessThanOrEqual(200);
      expect(passwords.length).toBeLessThanOrEqual(20);
    }
  });

  it('never throws on random URLs and finds site links in noise', () => {
    const rnd = random(7);
    const alphabet = 'abc/:?#&=%.@!~-_ ' + 'kemono.crcoomer.stpawchive.pw' + '\u0000‮日本';
    for (let i = 0; i < 20_000; i++) {
      let s = rnd() < 0.5 ? 'https://' : '';
      const length = Math.floor(rnd() * 80);
      for (let j = 0; j < length; j++) s += alphabet[Math.floor(rnd() * alphabet.length)];
      expect(() => parsePageUrl(s)).not.toThrow();
    }
    const noise = `${'x '.repeat(10_000)}https://kemono.cr/patreon/user/1/post/2 ${'y '.repeat(10_000)}`;
    expect(extractPageLinks(noise)).toHaveLength(1);
  });
});

describe('the bridge under load', () => {
  it('sends fifty jobs at once while the app moves ports', async () => {
    let port = 49517;
    let received = 0;
    const token = 'a'.repeat(64);
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (Number(url.port) !== port) throw new TypeError('refused');
      if (url.pathname === '/v1/hello')
        return Response.json({ app: 'Pawchive Downloader', version: '2.0.0', paired: true });
      const auth = (init?.headers as Record<string, string>)?.Authorization;
      if (auth !== `Bearer ${token}`) return new Response(null, { status: 401 });
      received += 1;
      // Halfway through, the app restarts on its next port.
      if (received === 25) port = 49518;
      return Response.json({ jobId: `job-${received}`, duplicate: false });
    }) as typeof fetch;
    let state: BridgeState = { ...EMPTY_BRIDGE, token, port: 49517 };
    const bridge = new AppBridge({
      fetch: fakeFetch,
      load: async () => state,
      save: async (next) => {
        state = next;
      },
    });
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        bridge.send({
          kind: 'refs',
          refs: [{ service: 'patreon', creatorId: '1', postId: String(i) }],
        }),
      ),
    );
    expect(results.every((r) => r.jobId.startsWith('job-'))).toBe(true);
    expect(state.port).toBe(49518);
  });
});
