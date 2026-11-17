import { describe, expect, it } from 'vitest';
import {
  apiUrls,
  canonicalPath,
  fileUrl,
  hashFromPath,
  isSiteHost,
  isSiteUrl,
  pageUrls,
  parsePageUrl,
  thumbnailUrl,
} from '../../src/lib/pawchive/urls';

const HASH = '64bb473acd217b4e30e4c4a65a78b5dd1d0e649f32e8b9c704912165d3625336';

describe('site hosts', () => {
  it('accepts the site and its subdomains only', () => {
    expect(isSiteHost('pawchive.pw')).toBe(true);
    expect(isSiteHost('n1.pawchive.pw')).toBe(true);
    expect(isSiteHost('PAWCHIVE.PW.')).toBe(true);
    expect(isSiteHost('evilpawchive.pw')).toBe(false);
    expect(isSiteHost('pawchive.pw.evil.com')).toBe(false);
  });

  it('requires https', () => {
    expect(isSiteUrl('https://pawchive.pw/x')).toBe(true);
    expect(isSiteUrl('http://pawchive.pw/x')).toBe(false);
    expect(isSiteUrl('not a url')).toBe(false);
  });
});

describe('parsePageUrl', () => {
  it('recognises post pages', () => {
    expect(parsePageUrl('https://pawchive.pw/patreon/user/2581747/post/175580645')).toEqual({
      kind: 'post',
      service: 'patreon',
      creatorId: '2581747',
      postId: '175580645',
    });
  });

  it('recognises post pages with trailing parts', () => {
    expect(parsePageUrl('https://pawchive.pw/fanbox/user/1386751/post/99/revision/3').kind).toBe('post');
  });

  it('recognises creator pages with offset and query', () => {
    expect(parsePageUrl('https://pawchive.pw/patreon/user/2581747?o=120&q=mod')).toEqual({
      kind: 'creator',
      service: 'patreon',
      creatorId: '2581747',
      offset: 100,
      query: 'mod',
    });
  });

  it('treats creator sub pages as other', () => {
    expect(parsePageUrl('https://pawchive.pw/patreon/user/2581747/tags').kind).toBe('other');
  });

  it('recognises the posts listing', () => {
    expect(parsePageUrl('https://pawchive.pw/posts?q=test')).toEqual({ kind: 'listing', offset: 0, query: 'test' });
  });

  it('ignores other hosts and pages', () => {
    expect(parsePageUrl('https://kemono.cr/patreon/user/1/post/2').kind).toBe('other');
    expect(parsePageUrl('https://n1.pawchive.pw/patreon/user/1/post/2').kind).toBe('other');
    expect(parsePageUrl('https://pawchive.pw/').kind).toBe('other');
    expect(parsePageUrl('garbage').kind).toBe('other');
    expect(parsePageUrl('https://pawchive.pw/x%20y/user/1').kind).toBe('other');
  });
});

describe('url builders', () => {
  it('builds API urls', () => {
    expect(apiUrls.post('patreon', '1', '2')).toBe('https://pawchive.pw/api/v1/patreon/user/1/post/2');
    expect(apiUrls.profile('fanbox', '9')).toBe('https://pawchive.pw/api/v1/fanbox/user/9/profile');
    expect(apiUrls.creatorPosts('patreon', '1', 50, 'a b')).toBe(
      'https://pawchive.pw/api/v1/patreon/user/1/posts?o=50&q=a+b',
    );
    expect(apiUrls.recentPosts()).toBe('https://pawchive.pw/api/v1/posts?o=0');
    expect(apiUrls.recentPosts(50, 'x')).toBe('https://pawchive.pw/api/v1/posts?o=50&q=x');
  });

  it('builds page urls', () => {
    expect(pageUrls.creator('patreon', '1')).toBe('https://pawchive.pw/patreon/user/1');
    expect(pageUrls.icon('patreon', '1')).toBe('https://pawchive.pw/icons/patreon/1');
    expect(pageUrls.banner('patreon', '1')).toBe('https://pawchive.pw/banners/patreon/1');
  });
});

describe('storage paths', () => {
  it('extracts the hash and extension', () => {
    expect(hashFromPath(`/264/bb/${HASH}.png`)).toEqual({ hash: HASH, ext: 'png' });
    expect(hashFromPath('/x/y/not-a-hash.png')).toBeNull();
  });

  it('derives the canonical thumbnail path', () => {
    expect(canonicalPath(`/264/bb/${HASH}.png`)).toBe(`/64/bb/${HASH}.png`);
    expect(thumbnailUrl(`/264/bb/${HASH}.png`)).toBe(
      `https://img.pawchive.pw/thumbnail/data/64/bb/${HASH}.png`,
    );
    expect(thumbnailUrl('/nope')).toBeNull();
  });

  it('builds full file urls on the media server', () => {
    expect(
      fileUrl({ name: 'A (1).png', path: `/264/bb/${HASH}.png`, server: 'https://n1.pawchive.pw' }),
    ).toBe(`https://n1.pawchive.pw/data/264/bb/${HASH}.png?f=A%20(1).png`);
  });

  it('refuses preview-only, server-less and foreign files', () => {
    const path = `/64/bb/${HASH}.png`;
    expect(fileUrl({ path, preview_only: true, server: 'https://n1.pawchive.pw' })).toBeNull();
    expect(fileUrl({ path })).toBeNull();
    expect(fileUrl({ path, server: 'https://evil.example' })).toBeNull();
    expect(fileUrl({ path, server: 'http://n1.pawchive.pw' })).toBeNull();
    expect(fileUrl({ path, server: '::bad::' })).toBeNull();
  });
});
