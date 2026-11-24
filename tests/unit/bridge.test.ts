import { describe, expect, it } from 'vitest';
import {
  AppBridge,
  BRIDGE_PORTS,
  EMPTY_BRIDGE,
  toAppOptions,
  toAppRequest,
  type BridgeState,
} from '../../src/lib/bridge';

interface FakeApp {
  port: number | null;
  token: string | null;
  code: string;
  jobs: Array<{ id: string; title: string }>;
  calls: Array<{ url: string; method: string; auth: string | null; body: unknown }>;
  /** Answer the hello on this port with something that is not the app. */
  impostorPort?: number;
}

function fakeApp(app: FakeApp): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const port = Number(url.port);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const auth = headers.Authorization ?? null;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    app.calls.push({ url: url.pathname, method: init?.method ?? 'GET', auth, body });
    if (port === app.impostorPort) return Response.json({ hello: 'something else' });
    if (port !== app.port) throw new TypeError('Failed to fetch');
    const authed = app.token !== null && auth === `Bearer ${app.token}`;
    switch (url.pathname) {
      case '/v1/hello':
        return Response.json({ app: 'Pawchive Downloader', version: '2.0.0', paired: authed });
      case '/v1/pair':
        if ((body as { code: string }).code !== app.code)
          return Response.json({ error: 'bad-code' }, { status: 401 });
        app.token = 'f'.repeat(64);
        return Response.json({ token: app.token });
      case '/v1/jobs':
        if (!authed) return Response.json({ error: 'not-paired' }, { status: 401 });
        if (init?.method === 'POST') {
          const id = `job-${app.jobs.length + 1}`;
          app.jobs.push({ id, title: String((body as { title?: string }).title ?? '') });
          return Response.json({ jobId: id, duplicate: false });
        }
        return Response.json(app.jobs);
      case '/v1/watch':
        if (!authed) return Response.json({ error: 'not-paired' }, { status: 401 });
        return Response.json({ added: true });
      default:
        if (url.pathname.startsWith('/v1/jobs/')) {
          if (!authed) return Response.json({ error: 'not-paired' }, { status: 401 });
          return url.pathname.endsWith('/explode')
            ? Response.json({ error: 'unknown-action' }, { status: 400 })
            : new Response(null, { status: 204 });
        }
        return new Response(null, { status: 404 });
    }
  }) as typeof fetch;
}

function setup(app: FakeApp, initial: BridgeState = { ...EMPTY_BRIDGE }) {
  let state = { ...initial };
  const bridge = new AppBridge({
    fetch: fakeApp(app),
    load: async () => state,
    save: async (next) => {
      state = next;
    },
  });
  return { bridge, state: () => state };
}

const app = (overrides: Partial<FakeApp> = {}): FakeApp => ({
  port: 49517,
  token: null,
  code: '123456',
  jobs: [],
  calls: [],
  ...overrides,
});

describe('finding the app', () => {
  it('reports a closed app without throwing', async () => {
    const { bridge } = setup(app({ port: null }));
    expect(await bridge.status()).toEqual({
      running: false,
      paired: false,
      port: null,
      version: null,
    });
  });

  it('finds the app on a fallback port and remembers it', async () => {
    const fake = app({ port: BRIDGE_PORTS[2]! });
    const { bridge, state } = setup(fake);
    expect(await bridge.status()).toMatchObject({ running: true, port: 49519, version: '2.0.0' });
    expect(state().port).toBe(49519);
    // Next time the remembered port is asked first.
    fake.calls.length = 0;
    await bridge.status();
    expect(fake.calls[0]?.url).toBe('/v1/hello');
    expect(fake.calls).toHaveLength(1);
  });

  it('ignores something else answering on a port', async () => {
    const { bridge } = setup(app({ port: 49518, impostorPort: 49517 }));
    expect(await bridge.status()).toMatchObject({ running: true, port: 49518 });
  });
});

describe('pairing', () => {
  it('pairs with the code, keeping only its digits', async () => {
    const fake = app();
    const { bridge, state } = setup(fake);
    const status = await bridge.pair(' 123 456 ', 'Chrome: Pawchive Downloader');
    expect(status.paired).toBe(true);
    expect(state().token).toBe('f'.repeat(64));
    expect(fake.calls.find((c) => c.url === '/v1/pair')?.body).toEqual({
      code: '123456',
      name: 'Chrome: Pawchive Downloader',
    });
    expect((await bridge.status()).paired).toBe(true);
  });

  it('says why pairing failed', async () => {
    await expect(setup(app()).bridge.pair('999999', 'x')).rejects.toMatchObject({
      code: 'bad-code',
    });
    await expect(setup(app({ port: null })).bridge.pair('123456', 'x')).rejects.toMatchObject({
      code: 'not-running',
    });
  });

  it('forgets the pairing, here and in the app', async () => {
    const fake = app();
    const { bridge, state } = setup(fake);
    await bridge.pair('123456', 'x');
    await bridge.unpair();
    expect(state()).toEqual(EMPTY_BRIDGE);
    const told = fake.calls.find((c) => c.url === '/v1/unpair');
    expect(told).toMatchObject({ method: 'POST', auth: `Bearer ${'f'.repeat(64)}` });
  });

  it('forgets the pairing even when the app is closed', async () => {
    const fake = app();
    const { bridge, state } = setup(fake);
    await bridge.pair('123456', 'x');
    fake.port = null;
    await bridge.unpair();
    expect(state()).toEqual(EMPTY_BRIDGE);
  });

  it('checks in only while paired', async () => {
    const fake = app();
    const { bridge } = setup(fake);
    await bridge.checkIn();
    expect(fake.calls).toHaveLength(0);
    await bridge.pair('123456', 'x');
    fake.calls.length = 0;
    await bridge.checkIn();
    expect(fake.calls).toEqual([
      { url: '/v1/hello', method: 'GET', auth: `Bearer ${'f'.repeat(64)}`, body: undefined },
    ]);
  });
});

describe('using the app', () => {
  it('sends jobs with the token and lists and controls them', async () => {
    const fake = app();
    const { bridge } = setup(fake);
    await bridge.pair('123456', 'x');
    const sent = await bridge.send({
      kind: 'refs',
      title: 'One',
      refs: [{ service: 'patreon@kemono', creatorId: '1', postId: '2' }],
    });
    expect(sent).toEqual({ jobId: 'job-1', duplicate: false });
    expect(fake.calls.at(-1)?.auth).toBe(`Bearer ${'f'.repeat(64)}`);
    expect(await bridge.jobs()).toEqual([{ id: 'job-1', title: 'One' }]);
    await bridge.act('job-1', 'pause');
    expect(fake.calls.at(-1)?.url).toBe('/v1/jobs/job-1/pause');
    expect(await bridge.watch('fanbox@coomer', '9', 'Cat')).toBe(true);
    expect(fake.calls.at(-1)?.body).toEqual({
      service: 'fanbox@coomer',
      creatorId: '9',
      name: 'Cat',
    });
  });

  it('needs pairing, and notices when the app forgot it', async () => {
    const fake = app();
    const { bridge } = setup(fake);
    await expect(bridge.send({ kind: 'refs', refs: [] })).rejects.toMatchObject({
      code: 'not-paired',
    });
    await bridge.pair('123456', 'x');
    fake.token = 'revoked-in-the-app';
    await expect(bridge.jobs()).rejects.toMatchObject({ code: 'not-paired' });
  });

  it('finds the app again after it restarted on another port', async () => {
    const fake = app();
    const { bridge, state } = setup(fake);
    await bridge.pair('123456', 'x');
    fake.port = 49518;
    expect((await bridge.send({ kind: 'refs', refs: [] })).jobId).toBe('job-1');
    expect(state().port).toBe(49518);
  });

  it('reports the app being closed', async () => {
    const fake = app();
    const { bridge } = setup(fake);
    await bridge.pair('123456', 'x');
    fake.port = null;
    await expect(bridge.jobs()).rejects.toMatchObject({ code: 'not-running' });
  });

  it('refuses unknown actions', async () => {
    const { bridge } = setup(app());
    await bridge.pair('123456', 'x');
    await expect(bridge.act('job-1', 'explode' as 'pause')).rejects.toMatchObject({
      code: 'unknown-action',
    });
  });
});

describe('the app request', () => {
  it('maps thumbnails only to the app mode, and drops what the app does not know', () => {
    expect(toAppOptions({ mode: 'zip', thumbnailsOnly: true, folderTemplate: 'x' })).toEqual({
      mode: 'thumbnails',
    });
    expect(
      toAppOptions({
        mode: 'individual',
        categories: ['image'],
        saveContent: 'both',
        saveMetadata: true,
        saveComments: false,
        saveAnnouncements: true,
        previewOnly: 'relay',
        skipDownloaded: false,
        zipMaxSizeMb: 100,
      }),
    ).toEqual({
      mode: 'individual',
      categories: ['image'],
      saveContent: 'both',
      saveMetadata: true,
      saveComments: false,
      saveAnnouncements: true,
      previewOnly: 'relay',
      skipDownloaded: false,
    });
  });

  it('keeps the request shape the app reads', () => {
    expect(
      toAppRequest({ kind: 'creator', service: 'onlyfans@coomer', creatorId: 'x', postIds: ['1'] }),
    ).toEqual({
      kind: 'creator',
      service: 'onlyfans@coomer',
      creatorId: 'x',
      query: null,
      postIds: ['1'],
      since: null,
      options: {},
    });
  });
});
