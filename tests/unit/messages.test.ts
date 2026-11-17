import { describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { call, MessageError } from '../../src/lib/messages';

describe('call', () => {
  it('sends plain data even when given reactive proxies', async () => {
    const send = vi
      .spyOn(fakeBrowser.runtime, 'sendMessage')
      .mockResolvedValue({ ok: true, data: { jobId: 'j1' } } as never);
    // Svelte state is a Proxy; Firefox refuses to structured-clone proxies.
    const post = new Proxy({ id: '1', files: [{ index: 1 }] }, {});
    const result = await call('jobs:create', {
      request: { kind: 'posts', posts: [{ post: post as never }] },
    });
    expect(result).toEqual({ jobId: 'j1' });
    const sent = (send.mock.calls[0] as unknown[])[0] as {
      type: string;
      request: { posts: Array<{ post: object }> };
    };
    expect(sent.type).toBe('jobs:create');
    expect(sent.request.posts[0]!.post).toEqual({ id: '1', files: [{ index: 1 }] });
    expect(() => structuredClone(sent)).not.toThrow();
  });

  it('turns failures into errors', async () => {
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValueOnce({
      ok: false,
      error: 'nope',
    } as never);
    await expect(call('jobs:list')).rejects.toThrow(new MessageError('nope'));
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValueOnce(undefined as never);
    await expect(call('jobs:list')).rejects.toThrow('No answer to jobs:list');
  });
});
