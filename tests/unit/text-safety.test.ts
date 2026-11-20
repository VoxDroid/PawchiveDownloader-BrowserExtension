import { describe, expect, it } from 'vitest';
import { parseRelayLinks } from '../../src/lib/pawchive/relay';
import { decodeEntities, htmlToText, stripTags } from '../../src/lib/pawchive/text';

describe('decodeEntities', () => {
  it('decodes once, so an escaped entity stays an entity', () => {
    expect(decodeEntities('&amp;lt;b&amp;gt;')).toBe('&lt;b&gt;');
    expect(decodeEntities('&amp;amp;')).toBe('&amp;');
  });

  it('decodes named, decimal and hex entities', () => {
    expect(decodeEntities('&lt;a&gt; &quot;x&quot; &#39;y&#x27; &apos;z&apos; a&nbsp;b')).toBe(
      `<a> "x" 'y' 'z' a b`,
    );
    expect(decodeEntities('&#233;&#xE9;&#x1F43E;')).toBe('éé🐾');
  });

  it('leaves invalid and unknown entities as written instead of throwing', () => {
    expect(decodeEntities('&#99999999;')).toBe('&#99999999;');
    expect(decodeEntities('&#xFFFFFF;')).toBe('&#xFFFFFF;');
    expect(decodeEntities('&#0;')).toBe('&#0;');
    expect(decodeEntities('&#xD800;')).toBe('&#xD800;');
    expect(decodeEntities('&bogus; & &amp')).toBe('&bogus; & &amp');
  });
});

describe('stripTags', () => {
  it('cannot rebuild a tag from nested pieces', () => {
    expect(stripTags('<<b>script>alert(1)<</b>/script>')).not.toMatch(/<script/i);
    expect(stripTags('<scr<i>ipt>x')).not.toMatch(/<[a-z]/i);
    expect(stripTags('a <b>bold</b> c')).toBe('a bold c');
  });

  it('keeps a lone < that is not a tag', () => {
    expect(stripTags('1 < 2 and 3 > 2')).toBe('1 < 2 and 3 > 2');
  });
});

describe('htmlToText', () => {
  it('turns escaped markup into its text, not into tags', () => {
    expect(htmlToText('<p>&amp;lt;script&amp;gt;</p>')).toBe('&lt;script&gt;');
    expect(htmlToText('<p>&lt;3 you</p>')).toBe('<3 you');
  });

  it('strips nested tag tricks', () => {
    expect(htmlToText('<p><<b>script>x<</b>/script></p>')).not.toMatch(/<script/i);
  });
});

describe('parseRelayLinks with hostile pages', () => {
  const relay = 'https://t4.pawchive.pw/f/abc/';
  it('survives huge entities and broken percent-encoding', () => {
    const html =
      `<a href="${relay}file.png?e=1&amp;s=x" download="a&#99999999;b.png">x</a>` +
      `<a href="${relay}%E0%A4?e=1">y</a>`;
    const index = parseRelayLinks(html);
    expect(index.byName.has('a&#99999999;b.png')).toBe(true);
    expect(index.byName.size).toBe(1);
  });

  it('decodes attribute entities once', () => {
    const html = `<a href="${relay}f.png?e=1" download="a&amp;amp;b.png">x</a>`;
    expect([...parseRelayLinks(html).byName.keys()]).toEqual(['a&amp;b.png']);
  });
});
