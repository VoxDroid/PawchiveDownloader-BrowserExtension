import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { buildZip, uniqueNames, type ZipCallbacks, type ZipSpec } from '../../src/lib/zip/builder';
import { textToDataUrl } from '../../src/lib/zip/hosts';

const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill);

function response(
  body: Uint8Array | null,
  status = 200,
  headers: Record<string, string> = {},
  chunk = 1000,
): Response {
  if (!body) return new Response(null, { status, headers });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < body.length; i += chunk) controller.enqueue(body.slice(i, i + chunk));
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { 'Content-Length': String(body.length), ...headers },
  });
}

function callbacks(
  routes: Record<string, Array<() => Response | Error>>,
): ZipCallbacks & { notes: number[] } {
  const notes: number[] = [];
  return {
    notes,
    fetch: vi.fn(async (input: RequestInfo | URL) => {
      const queue = routes[String(input)];
      const next = queue?.shift();
      if (!next) throw new TypeError(`no route for ${String(input)}`);
      const result = next();
      if (result instanceof Error) throw result;
      return result;
    }) as unknown as typeof fetch,
    pace: async () => undefined,
    note: (_url, status) => {
      notes.push(status);
      return status === 429 ? 1 : null;
    },
    backoff: () => 0,
    sleep: async () => undefined,
    progress: () => undefined,
  };
}

async function unzip(blob: Blob): Promise<Record<string, Uint8Array>> {
  return unzipSync(new Uint8Array(await blob.arrayBuffer()));
}

const spec = (entries: ZipSpec['entries'], extra: Partial<ZipSpec> = {}): ZipSpec => ({
  entries,
  maxPartBytes: 10_000_000,
  separateOverBytes: 5_000_000,
  maxRetries: 2,
  ...extra,
});

describe('buildZip', () => {
  it('stores files and text in one archive', async () => {
    const cb = callbacks({ 'https://n1.pawchive.pw/a': [() => response(bytes(2500, 1))] });
    const progress = vi.fn();
    const result = await buildZip(
      spec([
        { name: 'a.png', url: 'https://n1.pawchive.pw/a', category: 'image' },
        { name: 'content.txt', text: 'Hello Pawchive', category: 'text' },
      ]),
      { ...cb, progress },
      new AbortController().signal,
    );
    expect(result.parts).toHaveLength(1);
    expect(result.failed).toEqual([]);
    const files = await unzip(result.parts[0]!.blob);
    expect(Object.keys(files)).toEqual(['a.png', 'content.txt']);
    expect(files['a.png']).toEqual(bytes(2500, 1));
    expect(strFromU8(files['content.txt']!)).toBe('Hello Pawchive');
    expect(result.parts[0]!.size).toBe(result.parts[0]!.blob.size);
    expect(progress).toHaveBeenCalled();
  });

  it('splits into parts below the size limit', async () => {
    const cb = callbacks({
      'u:1': [() => response(bytes(3000, 1))],
      'u:2': [() => response(bytes(3000, 2))],
      'u:3': [() => response(bytes(3000, 3))],
    });
    const result = await buildZip(
      spec(
        [1, 2, 3].map((n) => ({ name: `${n}.bin`, url: `u:${n}`, category: 'image' as const })),
        { maxPartBytes: 7000 },
      ),
      cb,
      new AbortController().signal,
    );
    expect(result.parts.map((p) => p.names)).toEqual([['1.bin', '2.bin'], ['3.bin']]);
    for (const part of result.parts) expect(part.size).toBeLessThanOrEqual(7000);
    expect((await unzip(result.parts[1]!.blob))['3.bin']).toEqual(bytes(3000, 3));
  });

  it('hands back files too large for an archive', async () => {
    const cb = callbacks({
      'u:big': [() => response(bytes(6000))],
      'u:small': [() => response(bytes(10))],
    });
    const result = await buildZip(
      spec(
        [
          { name: 'big.mp4', url: 'u:big', category: 'video' },
          { name: 'small.png', url: 'u:small', category: 'image' },
        ],
        { separateOverBytes: 5000 },
      ),
      cb,
      new AbortController().signal,
    );
    expect(result.deferred).toEqual([{ name: 'big.mp4', url: 'u:big', size: 6000 }]);
    expect(result.parts[0]!.names).toEqual(['small.png']);
  });

  it('defers a file that turns out too large while streaming', async () => {
    const big = bytes(6000);
    const noLength = () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < big.length; i += 1000) controller.enqueue(big.slice(i, i + 1000));
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    };
    const cb = callbacks({
      'u:a': [() => response(bytes(100, 1)), () => response(bytes(100, 1))],
      'u:big': [noLength],
      'u:b': [() => response(bytes(100, 2))],
    });
    const result = await buildZip(
      spec(
        [
          { name: 'a.png', url: 'u:a', category: 'image' },
          { name: 'big.bin', url: 'u:big', category: 'other' },
          { name: 'b.png', url: 'u:b', category: 'image' },
        ],
        { separateOverBytes: 5000 },
      ),
      cb,
      new AbortController().signal,
    );
    expect(result.deferred.map((d) => d.name)).toEqual(['big.bin']);
    const names = result.parts.flatMap((p) => p.names);
    expect(names.sort()).toEqual(['a.png', 'b.png']);
    const files = Object.assign({}, ...(await Promise.all(result.parts.map((p) => unzip(p.blob)))));
    expect(files['a.png']).toEqual(bytes(100, 1));
  });

  it('retries server errors, waits out rate limits and reports what failed', async () => {
    const cb = callbacks({
      'u:flaky': [
        () => response(null, 502),
        () => response(null, 429, { 'Retry-After': '1' }),
        () => response(bytes(10, 9)),
      ],
      'u:gone': [() => response(null, 404)],
      'u:down': [
        () => new TypeError('offline'),
        () => new TypeError('offline'),
        () => new TypeError('offline'),
      ],
    });
    const result = await buildZip(
      spec([
        { name: 'flaky.png', url: 'u:flaky', category: 'image' },
        { name: 'gone.png', url: 'u:gone', category: 'image' },
        { name: 'down.png', url: 'u:down', category: 'image' },
        { name: 'nolink.png', category: 'image' },
      ]),
      cb,
      new AbortController().signal,
    );
    expect(result.parts[0]!.names).toEqual(['flaky.png']);
    expect(result.failed).toEqual([
      { name: 'gone.png', error: 'HTTP 404' },
      { name: 'down.png', error: 'offline' },
      { name: 'nolink.png', error: 'No download link' },
    ]);
    expect(cb.notes).toEqual([502, 429, 200, 404]);
  });

  it('stops when aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      buildZip(
        spec([{ name: 'a', text: 'x', category: 'text' }]),
        callbacks({}),
        controller.signal,
      ),
    ).rejects.toThrow();
  });

  it('writes no archive when nothing could be fetched', async () => {
    const result = await buildZip(
      spec([{ name: 'a.png', category: 'image' }]),
      callbacks({}),
      new AbortController().signal,
    );
    expect(result.parts).toEqual([]);
  });
});

describe('zip helpers', () => {
  it('makes entry names unique without regard to case', () => {
    expect(uniqueNames(['a.png', 'A.png', 'a.png', 'b', 'b'])).toEqual([
      'a.png',
      'A (2).png',
      'a (3).png',
      'b',
      'b (2)',
    ]);
  });

  it('encodes text as a UTF-8 data URL', () => {
    const url = textToDataUrl('héllo', 'text/plain');
    expect(url.startsWith('data:text/plain;charset=utf-8;base64,')).toBe(true);
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(url.split(',')[1]!), (c) => c.charCodeAt(0)),
    );
    expect(decoded).toBe('héllo');
  });
});
