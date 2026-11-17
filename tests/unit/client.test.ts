import { describe, expect, it, vi } from 'vitest';
import { ApiError, PawchiveClient } from '../../src/lib/pawchive/client';
import { SiteLimiter } from '../../src/lib/net/limiter';
import full from '../fixtures/post-full.json';
import { FakeClock } from '../helpers/fake-clock';

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function setup(responses: Array<Response | Error>) {
  const clock = new FakeClock();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    if (next instanceof Error) throw next;
    return next;
  });
  const limiter = new SiteLimiter({ clock, policy: { resumeSpreadMs: 0 } });
  const client = new PawchiveClient({
    fetch: fetchImpl as unknown as typeof fetch,
    clock,
    limiter,
    minIntervalMs: 0,
    maxRetries: 2,
  });
  return { client, calls, clock };
}

async function settle<T>(promise: Promise<T>, clock: FakeClock): Promise<T> {
  let done = false;
  const tracked = promise.finally(() => (done = true));
  for (let i = 0; i < 200 && !done; i++) await clock.advance(1000);
  return tracked;
}

describe('PawchiveClient', () => {
  it('fetches and normalizes a post, asking for JSON the way the site expects', async () => {
    const { client, calls, clock } = setup([json(full)]);
    const post = await settle(client.getPost('patreon', '2581747', '175580645'), clock);
    expect(post.files).toHaveLength(5);
    expect(calls[0]!.url).toBe('https://pawchive.pw/api/v1/patreon/user/2581747/post/175580645');
    expect((calls[0]!.init!.headers as Record<string, string>).Accept).toBe('text/css');
  });

  it('accepts Kemono style wrapped posts', async () => {
    const { client, clock } = setup([json({ post: full })]);
    const post = await settle(client.getPost('patreon', '2581747', '175580645'), clock);
    expect(post.id).toBe('175580645');
  });

  it('rejects unexpected shapes', async () => {
    const { client, clock } = setup([json({ error: 'x' }), json('not json at all'), json({})]);
    await expect(settle(client.getPost('a', 'b', 'c'), clock)).rejects.toBeInstanceOf(ApiError);
    await expect(settle(client.getPost('a', 'b', 'c'), clock)).rejects.toThrow(/JSON/);
    await expect(settle(client.getCreatorPage('a', 'b'), clock)).rejects.toThrow(/Unexpected/);
  });

  it('retries server errors and network failures, then gives up', async () => {
    const { client, calls, clock } = setup([json('', 502), new TypeError('offline'), json(full)]);
    const retries: string[] = [];
    (client as unknown as { onRetry: (i: { reason: string }) => void }).onRetry = (i) =>
      retries.push(i.reason);
    await settle(client.getPost('patreon', '1', '2'), clock);
    expect(calls).toHaveLength(3);
    expect(retries).toEqual(['HTTP 502', 'network']);

    const failing = setup([json('', 500), json('', 500), json('', 500)]);
    const error = await settle(failing.client.getPost('a', 'b', 'c'), failing.clock).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(500);

    const offline = setup([new TypeError('x'), new TypeError('x'), new TypeError('x')]);
    const netError = await settle(offline.client.getPost('a', 'b', 'c'), offline.clock).catch(
      (e) => e,
    );
    expect(netError.status).toBe(0);
  });

  it('waits out rate limits without spending retries', async () => {
    const { client, calls, clock } = setup([
      json('', 429, { 'Retry-After': '3' }),
      json('', 429, { 'Retry-After': '3' }),
      json('', 429, { 'Retry-After': '3' }),
      json(full),
    ]);
    await settle(client.getPost('patreon', '1', '2'), clock);
    expect(calls).toHaveLength(4);
    expect(clock.now()).toBeGreaterThanOrEqual(9000);
  });

  it('does not retry client errors', async () => {
    const { client, calls, clock } = setup([json({ error: 'not found' }, 404)]);
    const error = await settle(client.getPost('a', 'b', 'c'), clock).catch((e) => e);
    expect(error.notFound).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('pages through a creator until a short page', async () => {
    const page = (start: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        ...full,
        id: String(start + i),
        attachments: [],
      }));
    const { client, calls, clock } = setup([
      json(page(0, 50)),
      json(page(50, 50)),
      json(page(100, 7)),
    ]);
    const progress: number[] = [];
    const posts = await settle(
      client.getAllCreatorPosts('patreon', '1', { onProgress: (p) => progress.push(p.posts) }),
      clock,
    );
    expect(posts).toHaveLength(107);
    expect(progress).toEqual([50, 100, 107]);
    expect(calls.map((c) => new URL(c.url).searchParams.get('o'))).toEqual(['0', '50', '100']);
  });

  it('stops paging early when asked to', async () => {
    const page = Array.from({ length: 50 }, (_, i) => ({ ...full, id: String(i) }));
    const { client, calls, clock } = setup([json(page), json(page)]);
    const posts = await settle(
      client.getAllCreatorPosts('patreon', '1', { stopWhen: () => true }),
      clock,
    );
    expect(posts).toHaveLength(50);
    expect(calls).toHaveLength(1);
    const limited = setup([json(page)]);
    expect(
      await settle(limited.client.getAllCreatorPosts('p', '1', { maxPosts: 10 }), limited.clock),
    ).toHaveLength(10);
  });

  it('loads profiles, recent posts and relay links', async () => {
    const { client, clock } = setup([
      json({ id: '1', name: 'Histy', service: 'patreon' }),
      json([full]),
      json({}),
      new Response(
        '<a href="https://t1.pawchive.pw/f/a/b.zip?e=9999999999&s=1" download="b.zip">b</a>',
      ),
    ]);
    expect((await settle(client.getCreator('patreon', '1'), clock)).name).toBe('Histy');
    expect(await settle(client.getRecentPosts(), clock)).toHaveLength(1);
    expect(await settle(client.getRecentPosts(), clock)).toEqual([]);
    const index = await settle(client.getRelayIndex('patreon', '1', '2'), clock);
    expect(index.byName.get('b.zip')).toBeTruthy();
  });

  it('stops when aborted', async () => {
    const { client, clock } = setup([json(full)]);
    const controller = new AbortController();
    controller.abort();
    await expect(settle(client.getPost('a', 'b', 'c', controller.signal), clock)).rejects.toThrow();
  });
});
