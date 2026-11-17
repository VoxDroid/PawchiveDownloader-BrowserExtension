import { describe, expect, it } from 'vitest';
import full from '../fixtures/post-full.json';
import previewOnly from '../fixtures/post-preview-only.json';
import {
  categoryOf,
  extensionOf,
  htmlToText,
  inlineImages,
  normalizeCreator,
  normalizePost,
} from '../../src/lib/pawchive/normalize';

describe('normalizePost', () => {
  const post = normalizePost(full);

  it('keeps post metadata', () => {
    expect(post.id).toBe('175580645');
    expect(post.creatorId).toBe('2581747');
    expect(post.tags).toEqual(['mod', 're4']);
    expect(post.nextId).toBe('175180194');
    expect(post.url).toBe('https://pawchive.pw/patreon/user/2581747/post/175580645');
  });

  it('removes the main file repeated among attachments', () => {
    expect(post.files.map((f) => f.name)).toEqual([
      'Screenshot (1790).png',
      'Screenshot (1793).png',
      'word.png',
      'Neverness to Everness - Elyms.rar',
      'trailer.mp4',
    ]);
    expect(post.files.map((f) => f.index)).toEqual([1, 2, 3, 4, 5]);
  });

  it('classifies files and builds urls', () => {
    const rar = post.files[3]!;
    expect(rar.category).toBe('archive');
    expect(rar.url).toMatch(/^https:\/\/n4\.pawchive\.pw\/data\/280\/57\//);
    expect(rar.thumbnailUrl).toBeNull();
    expect(post.files[0]!.thumbnailUrl).toMatch(
      /^https:\/\/img\.pawchive\.pw\/thumbnail\/data\/64\/bb\//,
    );
    expect(post.files[4]!.category).toBe('video');
    expect(post.files[0]!.role).toBe('file');
    expect(post.files[1]!.role).toBe('attachment');
  });

  it('marks preview-only files', () => {
    const p = normalizePost(previewOnly);
    expect(p.files).toHaveLength(3);
    expect(p.files.every((f) => f.previewOnly && f.url === null)).toBe(true);
    expect(p.tags).toEqual([]);
  });

  it('accepts a listing entry with only a substring', () => {
    const p = normalizePost({
      id: '1',
      user: '2',
      service: 'fanbox',
      substring: '<p>hi</p>',
      file: {},
      attachments: [],
    });
    expect(p.contentHtml).toBe('<p>hi</p>');
    expect(p.files).toEqual([]);
    expect(p.title).toBe('');
  });

  it('picks up images embedded in the body', () => {
    const hash = 'aa11c4c429fd032bc65773b1f19263ba72ed0bb39a8929a899aa800ba4b6f5ff';
    const p = normalizePost({
      id: '1',
      user: '2',
      service: 'patreon',
      content: `<p><img src="https://n3.pawchive.pw/data/2aa/11/${hash}.jpg?f=inline.jpg"><img src="/data/aa/11/${hash}.jpg"><img src="https://cdn.example/x.png"></p>`,
    });
    expect(p.files).toHaveLength(1);
    expect(p.files[0]).toMatchObject({ role: 'inline', name: 'inline.jpg', previewOnly: false });
  });
});

describe('inlineImages', () => {
  it('treats relative data paths as preview-only', () => {
    const hash = 'bb11c4c429fd032bc65773b1f19263ba72ed0bb39a8929a899aa800ba4b6f5ff';
    expect(inlineImages(`<img alt="x" src='/data/bb/11/${hash}.png'>`)).toEqual([
      { path: `/bb/11/${hash}.png`, name: `${hash}.png`, preview_only: true },
    ]);
    expect(inlineImages('<img src="">')).toEqual([]);
    expect(inlineImages('<img src="/static/x.png">')).toEqual([]);
  });
});

describe('helpers', () => {
  it('reads extensions', () => {
    expect(extensionOf('a.PNG')).toBe('png');
    expect(extensionOf('archive.tar.gz')).toBe('gz');
    expect(extensionOf('.hidden')).toBe('');
    expect(extensionOf('noext')).toBe('');
    expect(extensionOf('dir.x/file')).toBe('');
  });

  it('maps categories', () => {
    expect(categoryOf('JPG')).toBe('image');
    expect(categoryOf('psd')).toBe('image');
    expect(categoryOf('flac')).toBe('audio');
    expect(categoryOf('pdf')).toBe('document');
    expect(categoryOf('txt')).toBe('text');
    expect(categoryOf('exe')).toBe('other');
  });

  it('converts html to text', () => {
    expect(
      htmlToText(
        '<p>One<br>Two</p><p>Three &amp; four</p><ul><li>a</li></ul><a href="https://x.y">link</a>',
      ),
    ).toBe('One\nTwo\nThree & four\n- a\nlink (https://x.y)');
    expect(htmlToText('<a href="https://x.y">https://x.y</a>')).toBe('https://x.y');
    expect(htmlToText('<p></p>')).toBe('');
  });

  it('normalizes creators', () => {
    const c = normalizeCreator({
      id: '1',
      name: ' Histy ',
      service: 'patreon',
      public_id: 'Histy',
      updated: 1794834000,
    });
    expect(c.name).toBe('Histy');
    expect(c.iconUrl).toBe('https://pawchive.pw/icons/patreon/1');
    expect(c.updated).toBe(new Date(1794834000 * 1000).toISOString());
    expect(normalizeCreator({ id: '2', name: '', service: 'fanbox' }).name).toBe('2');
  });
});
