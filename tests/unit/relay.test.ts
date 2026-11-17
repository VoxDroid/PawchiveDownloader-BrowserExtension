import { describe, expect, it } from 'vitest';
import { findRelay, isRelayUrl, parseRelayLinks } from '../../src/lib/pawchive/relay';
import { normalizePost } from '../../src/lib/pawchive/normalize';
import raw from '../fixtures/post-preview-only.json';
import html from '../fixtures/post-preview-only.html?raw';
const EXPIRY = 1794933059 * 1000;

describe('relay links', () => {
  it('recognises relay urls', () => {
    expect(isRelayUrl('https://t4.pawchive.pw/f/abc/001.jpg?e=1&s=2')).toBe(true);
    expect(isRelayUrl('https://n4.pawchive.pw/f/abc/001.jpg')).toBe(false);
    expect(isRelayUrl('https://t4.pawchive.pw/data/abc')).toBe(false);
    expect(isRelayUrl('https://t4.evil.pw/f/abc')).toBe(false);
    expect(isRelayUrl('nonsense')).toBe(false);
  });

  it('indexes links by thumbnail path and name', () => {
    const index = parseRelayLinks(html);
    expect(index.byPath.size).toBe(2);
    expect(index.byName.get('pack.zip')?.url).toBe(
      'https://t1.pawchive.pw/f/0d0d0d0d0d0d0d0d/pack.zip?e=1794933059&s=0000',
    );
    expect(index.byName.get('001.jpg')?.expiresAt).toBe(EXPIRY);
  });

  it('matches every preview-only file of the post', () => {
    const post = normalizePost(raw);
    const index = parseRelayLinks(html);
    const now = EXPIRY - 3_600_000;
    expect(post.files.map((f) => findRelay(index, f, now)?.url.split('?')[0])).toEqual([
      'https://t4.pawchive.pw/f/39720003eb439d35/001.jpg',
      'https://t2.pawchive.pw/f/b7fde64b19d0cf7b/002.jpg',
      'https://t1.pawchive.pw/f/0d0d0d0d0d0d0d0d/pack.zip',
    ]);
  });

  it('ignores links that are about to expire', () => {
    const post = normalizePost(raw);
    const index = parseRelayLinks(html);
    expect(findRelay(index, post.files[0]!, EXPIRY - 30_000)).toBeNull();
  });

  it('returns null when the page has no link for a file', () => {
    expect(findRelay(parseRelayLinks('<p>nothing</p>'), { path: '/x', name: 'x' })).toBeNull();
  });
});
