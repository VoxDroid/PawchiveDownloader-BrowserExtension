import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildFolderPath, renderTemplate } from '../../src/lib/download/template';
import {
  appCanDownload,
  fileHostLinks,
  findPasswords,
  linksText,
} from '../../src/lib/pawchive/links';
import { normalizeCreator, normalizePost } from '../../src/lib/pawchive/normalize';
import {
  bareService,
  isSitePageHost,
  qualify,
  SITE_PAGE_MATCHES,
  siteFromHost,
  siteOfService,
  splitService,
} from '../../src/lib/pawchive/sites';
import {
  apiUrls,
  extractPageLinks,
  fileUrl,
  pageUrls,
  parsePageUrl,
  thumbnailUrl,
} from '../../src/lib/pawchive/urls';
import { coerceSettings } from '../../src/lib/settings';

const HASH = '64bb473acd217b4e30e4c4a65a78b5dd1d0e649f32e8b9c704912165d3625336';

describe('sites', () => {
  it('knows every domain of every site, old ones included', () => {
    expect(siteFromHost('pawchive.pw')).toBe('pawchive');
    expect(siteFromHost('n3.kemono.cr')).toBe('kemono');
    expect(siteFromHost('kemono.su')).toBe('kemono');
    expect(siteFromHost('img.coomer.st')).toBe('coomer');
    expect(siteFromHost('coomer.party')).toBe('coomer');
    expect(siteFromHost('KEMONO.CR.')).toBe('kemono');
    expect(siteFromHost('notkemono.cr')).toBeNull();
    expect(siteFromHost('kemono.cr.evil.com')).toBeNull();
  });

  it('tells site pages from media servers', () => {
    expect(isSitePageHost('kemono.cr')).toBe(true);
    expect(isSitePageHost('www.coomer.st')).toBe(true);
    expect(isSitePageHost('n1.kemono.cr')).toBe(false);
  });

  it('qualifies services like the desktop app', () => {
    expect(qualify('pawchive', 'patreon')).toBe('patreon');
    expect(qualify('kemono', 'patreon')).toBe('patreon@kemono');
    expect(qualify('coomer', 'onlyfans@kemono')).toBe('onlyfans@coomer');
    expect(splitService('fanbox@kemono')).toEqual({ site: 'kemono', bare: 'fanbox' });
    expect(splitService('patreon')).toEqual({ site: 'pawchive', bare: 'patreon' });
    expect(siteOfService('onlyfans@coomer')).toBe('coomer');
    expect(bareService('onlyfans@coomer')).toBe('onlyfans');
    // An unknown site falls back to Pawchive rather than inventing one.
    expect(splitService('x@nowhere').site).toBe('pawchive');
  });

  it('runs the content script on exactly the page domains', () => {
    const source = readFileSync('src/entrypoints/content/index.ts', 'utf8');
    const declared = [...source.matchAll(/'(https:\/\/[^']+\/\*)'/g)].map((m) => m[1]);
    expect(new Set(declared)).toEqual(new Set(SITE_PAGE_MATCHES));
  });
});

describe('links on other sites', () => {
  it('parses Kemono and Coomer pages with qualified services', () => {
    expect(parsePageUrl('https://kemono.cr/patreon/user/1/post/2')).toEqual({
      kind: 'post',
      service: 'patreon@kemono',
      creatorId: '1',
      postId: '2',
    });
    expect(parsePageUrl('https://www.kemono.su/fanbox/user/9?o=100&q=cat')).toEqual({
      kind: 'creator',
      service: 'fanbox@kemono',
      creatorId: '9',
      offset: 100,
      query: 'cat',
    });
    expect(parsePageUrl('coomer.party/onlyfans/user/belle')).toEqual({
      kind: 'creator',
      service: 'onlyfans@coomer',
      creatorId: 'belle',
      offset: 0,
      query: null,
    });
    expect(parsePageUrl('https://coomer.st/posts?o=50')).toEqual({
      kind: 'listing',
      offset: 50,
      query: null,
      site: 'coomer',
    });
    expect(parsePageUrl('https://n1.kemono.cr/patreon/user/1/post/2').kind).toBe('other');
  });

  it('builds page and API urls on the right site', () => {
    expect(pageUrls.post('patreon@kemono', '1', '2')).toBe(
      'https://kemono.cr/patreon/user/1/post/2',
    );
    expect(pageUrls.creator('onlyfans@coomer', 'x')).toBe('https://coomer.st/onlyfans/user/x');
    expect(pageUrls.icon('patreon@kemono', '1')).toBe('https://img.kemono.cr/icons/patreon/1');
    expect(pageUrls.icon('patreon', '1')).toBe('https://pawchive.pw/icons/patreon/1');
    expect(apiUrls.post('fanbox@kemono', '9', '3')).toBe(
      'https://kemono.cr/api/v1/fanbox/user/9/post/3',
    );
    expect(apiUrls.recentPosts(0, 'cat', 'coomer')).toBe(
      'https://coomer.st/api/v1/posts?o=0&q=cat',
    );
    expect(apiUrls.creators('kemono')).toBe('https://kemono.cr/api/v1/creators');
    expect(apiUrls.comments('patreon', '1', '2')).toBe(
      'https://pawchive.pw/api/v1/patreon/user/1/post/2/comments',
    );
  });

  it('serves Kemono and Coomer files from the site when there is no media server', () => {
    const path = `/64/bb/${HASH}.png`;
    expect(fileUrl({ path, name: 'a b.png' }, 'kemono')).toBe(
      `https://kemono.cr/data${path}?f=a%20b.png`,
    );
    expect(fileUrl({ path, server: 'https://n2.coomer.st' }, 'coomer')).toBe(
      `https://n2.coomer.st/data${path}`,
    );
    // A server on another site is never trusted.
    expect(fileUrl({ path, server: 'https://n1.pawchive.pw' }, 'kemono')).toBeNull();
    // Pawchive itself never serves /data.
    expect(fileUrl({ path }, 'pawchive')).toBeNull();
    expect(thumbnailUrl(path, 'kemono')).toBe(`https://img.kemono.cr/thumbnail/data${path}`);
  });

  it('finds site links in free text once each', () => {
    const found = extractPageLinks(
      'see https://kemono.cr/patreon/user/1/post/2, and kemono.cr/patreon/user/1/post/2 ' +
        'plus (https://pawchive.pw/fanbox/user/9) and https://example.com/x',
    );
    expect(found.map((f) => f.ref.kind)).toEqual(['post', 'creator']);
    expect(found[1]?.link).toBe('https://pawchive.pw/fanbox/user/9');
  });
});

describe('normalizing posts of other sites', () => {
  it('qualifies the service and keeps Kemono inline images as full files', () => {
    const post = normalizePost(
      {
        id: '2',
        user: '1',
        service: 'patreon',
        title: ' Set ',
        content: `<p><img src="/data/aa/bb/${HASH}.jpg"></p><p>Mega: https://mega.nz/folder/abc#key Password: cat123</p>`,
        attachments: [{ name: 'x.zip' }],
      },
      'kemono',
    );
    expect(post.service).toBe('patreon@kemono');
    expect(post.url).toBe('https://kemono.cr/patreon/user/1/post/2');
    expect(post.files[0]?.previewOnly).toBe(false);
    expect(post.files[0]?.url).toContain('https://kemono.cr/data/aa/bb/');
    expect(post.incomplete).toBe(true);
    expect(post.links).toEqual(['https://mega.nz/folder/abc#key']);
    expect(post.passwords).toEqual(['cat123']);
  });

  it('treats a bare inline path on Pawchive as a preview', () => {
    const post = normalizePost({
      id: '2',
      user: '1',
      service: 'patreon',
      content: `<img src="/data/aa/bb/${HASH}.jpg">`,
    });
    expect(post.service).toBe('patreon');
    expect(post.files[0]?.previewOnly).toBe(true);
  });

  it('qualifies creators', () => {
    const creator = normalizeCreator({ id: '9', name: 'Cat', service: 'fanbox' }, 'coomer');
    expect(creator.service).toBe('fanbox@coomer');
    expect(creator.iconUrl).toBe('https://img.coomer.st/icons/fanbox/9');
  });
});

describe('outside links and passwords (same cases as the desktop app)', () => {
  it('finds file host links once', () => {
    const html = `<p>Full set: <a href="https://mega.nz/folder/abc#key">mega</a></p>
      <p>Mirror https://drive.google.com/file/d/xyz/view?usp=sharing.</p>
      <p>https://mega.nz/folder/abc#key and https://www.dropbox.com/s/q/a.zip?dl=0</p>
      <p>https://bunkr.si/a/zz https://twitter.com/me https://docs.google.com/document/d/1</p>
      <p>https://docs.google.com/file/d/2</p>`;
    expect(fileHostLinks(html)).toEqual([
      'https://mega.nz/folder/abc#key',
      'https://drive.google.com/file/d/xyz/view?usp=sharing',
      'https://www.dropbox.com/s/q/a.zip?dl=0',
      'https://bunkr.si/a/zz',
      'https://docs.google.com/file/d/2',
    ]);
  });

  it('finds passwords in many languages', () => {
    const html =
      '<p>Password: cat123</p><p>パスワード：「にゃん」</p><p>密码：abcd</p>' +
      '<p>pass: https://mega.nz/x</p><p>pw: cat123</p><p>compass: north</p>' +
      '<p>pass the test</p>';
    expect(findPasswords(html)).toEqual(['cat123', 'にゃん', 'abcd']);
    expect(findPasswords('<p>Nothing here</p>')).toEqual([]);
  });

  it('writes a links file only when there is something', () => {
    expect(linksText('T', 'u', [], [])).toBeNull();
    expect(linksText('T', 'u', ['https://mega.nz/a'], ['pw'])).toBe(
      'T\nu\n\nLinks\nhttps://mega.nz/a\n\nPasswords\npw\n',
    );
  });

  it('knows which hosts the desktop app downloads itself', () => {
    expect(appCanDownload('https://mega.nz/file/x#k')).toBe(true);
    expect(appCanDownload('https://www.dropbox.com/s/q/a.zip')).toBe(true);
    expect(appCanDownload('https://bunkr.si/a/zz')).toBe(false);
    expect(appCanDownload('not a url')).toBe(false);
  });
});

describe('the {site} token', () => {
  const ctx = {
    service: 'fanbox@kemono',
    creatorId: '9',
    creatorName: 'Cat',
    postId: '3',
    postTitle: 'Hi',
    published: '2026-01-02T00:00:00',
    added: null,
    index: 1,
    count: 1,
    fileName: 'a.png',
    ext: 'png',
    hash: null,
    role: 'file',
  };

  it('names the site and keeps {service} bare', () => {
    expect(renderTemplate('{site}/{service}', ctx)).toBe('Kemono/fanbox');
    expect(renderTemplate('{site}', { ...ctx, service: 'patreon' })).toBe('Pawchive');
  });

  it('puts every site in its own folder by default', () => {
    const folder = buildFolderPath(coerceSettings({}).folderTemplate, ctx);
    expect(folder.startsWith('Kemono/Cat (fanbox)/')).toBe(true);
  });

  it('moves the old default folder template to the new one', () => {
    const old = 'Pawchive/{creator} ({service})/{published:YYYY-MM-DD} {title} [{post_id}]';
    expect(coerceSettings({ folderTemplate: old }).folderTemplate.startsWith('{site}/')).toBe(true);
    const custom = 'Downloads/{creator}/{title}';
    expect(coerceSettings({ folderTemplate: custom }).folderTemplate).toBe(custom);
  });
});
