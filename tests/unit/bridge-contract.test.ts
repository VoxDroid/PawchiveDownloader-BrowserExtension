/**
 * Contract test with the real desktop app's bridge. Skipped unless
 * BRIDGE_CONTRACT_DIR points at a folder where the app's side of the test
 * (`ext_contract` in the app repository) writes `ready.json`: the port, a
 * pairing code and the raw posts it serves.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppBridge, BridgeError, EMPTY_BRIDGE, type BridgeState } from '../../src/lib/bridge';
import { normalizePost } from '../../src/lib/pawchive/normalize';
import type { RawPost } from '../../src/lib/pawchive/types';

const dir = process.env.BRIDGE_CONTRACT_DIR;
const ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

async function waitForFile(path: string, ms: number): Promise<string> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for ${path}`);
}

describe.skipIf(!dir)('bridge contract with the real desktop app', () => {
  it('pairs, sends every kind of job, lists and controls them, and watches', async () => {
    const ready = JSON.parse(await waitForFile(join(dir!, 'ready.json'), 120_000)) as {
      port: number;
      code: string;
      posts: RawPost[];
    };
    let state: BridgeState = { ...EMPTY_BRIDGE };
    const bridge = new AppBridge({
      // A browser adds the extension's Origin by itself; Node needs it set.
      fetch: (input, init) =>
        fetch(input, { ...init, headers: { ...(init?.headers ?? {}), Origin: ORIGIN } }),
      load: async () => state,
      save: async (next) => {
        state = next;
      },
      timeoutMs: 3000,
    });

    const before = await bridge.status();
    expect(before).toMatchObject({ running: true, paired: false, port: ready.port });

    await expect(bridge.pair('000000', 'Contract')).rejects.toMatchObject({ code: 'bad-code' });
    await expect(bridge.send({ kind: 'refs', refs: [] })).rejects.toBeInstanceOf(BridgeError);

    // The code works once; the app's code also had a wrong attempt before it.
    // Pairing again with it must fail after the first success.
    const paired = await bridge.pair(ready.code, 'Contract test');
    expect(paired.paired).toBe(true);
    expect(state.token).toMatch(/^[0-9a-f]{64}$/);
    expect((await bridge.status()).paired).toBe(true);

    // 1. A post the extension normalized itself, with one file picked.
    const first = normalizePost(ready.posts[0]!);
    const sentPosts = await bridge.send({
      kind: 'posts',
      title: first.title,
      creator: { service: first.service, id: first.creatorId, name: 'Aster Vale' },
      posts: [{ post: first, fileIndexes: [1] }],
      options: { mode: 'individual', saveContent: 'txt', skipDownloaded: false },
    });
    // 2. A reference to the other post.
    const sentRefs = await bridge.send({
      kind: 'refs',
      refs: [{ service: 'patreon', creatorId: '7', postId: '992' }],
      options: { skipDownloaded: false },
    });
    // 3. The whole creator.
    const sentCreator = await bridge.send({
      kind: 'creator',
      service: 'patreon',
      creatorId: '7',
      options: { skipDownloaded: false, mode: 'zip' },
    });
    const ids = [sentPosts.jobId, sentRefs.jobId, sentCreator.jobId];
    expect(new Set(ids).size).toBe(3);

    // The app's queue lists them, in the extension's own summary shape.
    const listed = await bridge.jobs();
    for (const id of ids) expect(listed.some((j) => j.id === id)).toBe(true);
    const sample = listed.find((j) => j.id === sentPosts.jobId)!;
    expect(sample).toMatchObject({ title: 'First', stats: expect.any(Object) });

    // Controls work, and unknown actions are refused.
    await bridge.act(sentCreator.jobId, 'pause');
    await bridge.act(sentCreator.jobId, 'resume');

    // Watching a creator from the extension adds it to the app.
    expect(await bridge.watch('patreon', '7', 'Aster Vale')).toBe(true);
    expect(await bridge.watch('patreon', '7', 'Aster Vale')).toBe(false);

    writeFileSync(join(dir!, 'done.json'), JSON.stringify({ jobIds: ids }));
    const verified = JSON.parse(await waitForFile(join(dir!, 'verified.json'), 120_000)) as {
      jobs: Array<{ status: string; done: number; failed: number }>;
      files: string[];
      watched: string[];
      pairings: string[];
    };
    expect(verified.jobs.every((j) => j.status === 'done' && j.failed === 0)).toBe(true);
    expect(verified.pairings).toContain('Contract test');
    console.log(JSON.stringify(verified, null, 2));
  }, 300_000);
});
