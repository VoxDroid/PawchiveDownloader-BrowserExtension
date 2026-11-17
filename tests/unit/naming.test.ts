import { describe, expect, it } from 'vitest';
import { MAX_PATH_LENGTH, sanitizePath, sanitizeSegment } from '../../src/lib/download/sanitize';
import {
  buildArchivePath,
  buildFilePath,
  buildFolderPath,
  formatDate,
  renderTemplate,
  unknownTokens,
  validateTemplate,
  type NameContext,
} from '../../src/lib/download/template';

const ctx: NameContext = {
  service: 'patreon',
  creatorId: '2581747',
  creatorName: 'Histy',
  postId: '175580645',
  postTitle: '[RE4R] EARLY ACCESS: Neverness / Everness?',
  published: '2026-11-17T08:59:08',
  added: '2026-11-17T10:00:00',
  index: 3,
  count: 12,
  fileName: 'Screenshot (1790).png',
  ext: 'png',
  hash: '64bb473acd217b4e30e4c4a65a78b5dd1d0e649f32e8b9c704912165d3625336',
  role: 'attachment',
  now: new Date(2026, 0, 2, 3, 4, 5),
};

describe('sanitizeSegment', () => {
  it('replaces characters Windows forbids', () => {
    expect(sanitizeSegment('a<b>c:d"e|f?g*h')).toBe('a_b_c_d_e_f_g_h');
  });

  it('strips invisible and control characters', () => {
    expect(sanitizeSegment('evil‮gnp.exe')).toBe('evilgnp.exe');
    expect(sanitizeSegment('tab\tname\u0000')).toBe('tab name');
  });

  it('removes leading dots, tildes and trailing dots or spaces', () => {
    expect(sanitizeSegment('..~hidden. . ')).toBe('hidden');
    expect(sanitizeSegment('   ')).toBe('_');
    expect(sanitizeSegment('', 'x')).toBe('x');
  });

  it('defuses reserved device names and shell extensions', () => {
    expect(sanitizeSegment('CON')).toBe('_CON');
    expect(sanitizeSegment('com1.txt')).toBe('_com1.txt');
    expect(sanitizeSegment('shortcut.lnk')).toBe('shortcut.lnk_');
  });

  it('truncates long names but keeps the extension', () => {
    const long = sanitizeSegment(`${'a'.repeat(300)}.jpeg`);
    expect(long.length).toBe(120);
    expect(long.endsWith('.jpeg')).toBe(true);
  });
});

describe('sanitizePath', () => {
  it('drops traversal and empty segments', () => {
    expect(sanitizePath('../a/./b//c\\..\\d.txt')).toBe('a/b/c/d.txt');
    expect(sanitizePath('/')).toBe('_');
  });

  it('keeps the total path within the limit', () => {
    const path = sanitizePath(`${'x'.repeat(110)}/${'y'.repeat(110)}/${'z'.repeat(110)}/${'f'.repeat(100)}.png`);
    expect(path.length).toBeLessThanOrEqual(MAX_PATH_LENGTH);
    expect(path.endsWith('.png')).toBe(true);
    expect(path.split('/')).toHaveLength(4);
  });

  it('shortens a lone file name too', () => {
    const path = sanitizePath(`${'d'.repeat(8)}/${'e'.repeat(8)}/${'f'.repeat(119)}.png`);
    expect(path.length).toBeLessThanOrEqual(MAX_PATH_LENGTH);
  });
});

describe('templates', () => {
  it('renders every token', () => {
    expect(
      renderTemplate(
        '{service}|{creator}|{creator_id}|{post_id}|{published}|{added:YYYY}|{date:YYYY-MM-DD HH.mm.ss}|{index}|{index:4}|{count}|{name}|{filename}|{ext}|{hash:8}|{role}',
        ctx,
      ),
    ).toBe(
      'patreon|Histy|2581747|175580645|2026-11-17|2026|2026-01-02 03.04.05|03|0003|12|Screenshot (1790)|Screenshot (1790).png|png|64bb473a|attachment',
    );
  });

  it('makes token values path safe', () => {
    expect(renderTemplate('{title}', ctx)).toBe('[RE4R] EARLY ACCESS_ Neverness _ Everness_');
  });

  it('leaves unknown tokens untouched and reports them', () => {
    expect(renderTemplate('{nope}-{name}', ctx)).toBe('{nope}-Screenshot (1790)');
    expect(unknownTokens('{nope} {name} {Bad}')).toEqual(['nope', 'Bad']);
  });

  it('falls back for missing values', () => {
    const bare = { ...ctx, postTitle: '', creatorName: '', published: null, hash: null };
    expect(renderTemplate('{title}/{creator}/{published}/{hash}', bare)).toBe('175580645/2581747//');
  });

  it('validates templates', () => {
    expect(validateTemplate('{name}.{ext}', 'file')).toBeNull();
    expect(validateTemplate('', 'file')).toBe('empty');
    expect(validateTemplate('', 'folder')).toBeNull();
    expect(validateTemplate('../{name}', 'folder')).toBe('parent');
    expect(validateTemplate('{oops}', 'file')).toBe('unknown');
    expect(validateTemplate('{name', 'file')).toBe('braces');
  });

  it('formats dates', () => {
    const date = new Date(Date.UTC(2026, 10, 7, 8, 9, 10));
    expect(formatDate(date, 'YY/MM/DD HH:mm:ss')).toBe('26/11/07 08:09:10');
    expect(formatDate(null)).toBe('');
  });
});

describe('path builders', () => {
  it('builds the default layout', () => {
    expect(
      buildFilePath(
        'Pawchive/{creator} ({service})/{published:YYYY-MM-DD} {title} [{post_id}]',
        '{index:2}_{filename}',
        ctx,
      ),
    ).toBe(
      'Pawchive/Histy (patreon)/2026-11-17 [RE4R] EARLY ACCESS_ Neverness _ Everness_ [175580645]/03_Screenshot (1790).png',
    );
  });

  it('adds the extension when the template forgets it', () => {
    expect(buildFilePath('', '{hash:6}', ctx)).toBe('64bb47.png');
  });

  it('falls back to the original name for empty results', () => {
    expect(buildFilePath('x', '{role:}', { ...ctx, role: '' })).toBe('x/Screenshot (1790).png');
  });

  it('builds folders and archives', () => {
    expect(buildFolderPath('Pawchive/{creator}', ctx)).toBe('Pawchive/Histy');
    expect(buildFolderPath('', ctx)).toBe('');
    expect(buildArchivePath('Pawchive/{creator}/{title}', '{post_id}', ctx)).toBe('Pawchive/Histy/175580645.zip');
    expect(buildArchivePath('Pawchive/{creator}', '{post_id}', ctx)).toBe('Pawchive/Histy/175580645.zip');
  });
});
