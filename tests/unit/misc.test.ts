import { describe, expect, it, vi } from 'vitest';
import {
  applyCheck,
  createWatchEntry,
  markSeen,
  totalNew,
  watchKey,
  SEEN_LIMIT,
} from '../../src/lib/watch';
import { formatLog, LogBook } from '../../src/lib/log';
import {
  DICTIONARIES,
  formatBytes,
  formatDate,
  formatDuration,
  formatNumber,
  formatRelative,
  LANGUAGE_NAMES,
  translate,
} from '../../src/lib/i18n';
import { LOCALES } from '../../src/lib/settings';
import { normalizePost } from '../../src/lib/pawchive/normalize';
import full from '../fixtures/post-full.json';

const post = (id: string) => normalizePost({ ...full, id });

describe('watchlist', () => {
  it('takes a baseline first, then reports new posts once', () => {
    let entry = createWatchEntry('patreon', '1', 'Histy', 100);
    expect(entry.key).toBe(watchKey('patreon', '1'));

    const first = applyCheck(entry, [post('3'), post('2'), post('1')], 200);
    expect(first.found).toEqual([]);
    expect(first.entry.lastCheckedAt).toBe(200);
    entry = first.entry;

    const second = applyCheck(entry, [post('5'), post('4'), post('3')], 300);
    expect(second.found.map((p) => p.id)).toEqual(['5', '4']);
    expect(second.found[0]).toMatchObject({ files: 5, title: full.title });
    entry = second.entry;
    expect(totalNew([entry])).toBe(2);

    // The same posts are not reported twice.
    const third = applyCheck(entry, [post('5'), post('4')], 400);
    expect(third.found).toEqual([]);
    expect(third.entry.newPosts).toHaveLength(2);

    expect(markSeen(entry, ['5']).newPosts.map((p) => p.id)).toEqual(['4']);
    expect(markSeen(entry).newPosts).toEqual([]);
  });

  it('takes the baseline on the first good check when earlier ones failed', () => {
    // What a failed check leaves behind.
    const failed = {
      ...createWatchEntry('patreon', '1', 'Histy', 100),
      lastCheckedAt: 150,
      error: 'offline',
    };
    const first = applyCheck(failed, [post('3'), post('2'), post('1')], 200);
    expect(first.found).toEqual([]);
    expect(applyCheck(first.entry, [post('4'), post('3')], 300).found).toHaveLength(1);
    // A creator without posts yet: their first post is new.
    const empty = applyCheck(createWatchEntry('patreon', '2', 'New', 100), [], 200).entry;
    expect(applyCheck(empty, [post('1')], 300).found).toHaveLength(1);
  });

  it('bounds the list of seen posts', () => {
    const many = Array.from({ length: SEEN_LIMIT + 50 }, (_, i) => post(String(i)));
    const { entry } = applyCheck(createWatchEntry('p', '1', 'x'), many);
    expect(entry.seenIds).toHaveLength(SEEN_LIMIT);
  });
});

describe('LogBook', () => {
  it('keeps entries above its level, bounded, and notifies listeners', () => {
    const book = new LogBook(3, 'info');
    const heard: string[] = [];
    const stop = book.subscribe((e) => heard.push(e.message));
    const log = book.logger('test');
    log.debug('hidden');
    log.info('one');
    log.warn('two', { a: 1 });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    log.error('three', new Error('boom'));
    log.scope('child').info('four', 'detail');
    stop();
    log.info('five');
    expect(book.list().map((e) => `${e.scope}:${e.message}`)).toEqual(
      ['test:two', 'test:three', 'test/child:four', 'test:five'].slice(-3),
    );
    expect(heard).toEqual(['one', 'two', 'three', 'four']);
    expect(book.list()[0]!.detail).toMatch(/boom/);
  });

  it('restores, clears and formats', () => {
    const book = new LogBook(10, 'debug');
    book.restore([
      { id: 7, at: 0, level: 'info', scope: 's', message: 'old', detail: 'line1\nline2' },
    ]);
    book.logger('s').debug('new');
    expect(book.list().map((e) => e.id)).toEqual([7, 8]);
    expect(formatLog(book.list())).toContain(
      '1970-01-01T00:00:00.000Z INFO  [s] old\n    line1\n    line2',
    );
    book.clear();
    expect(book.list()).toEqual([]);
  });

  it('describes unserializable details', () => {
    const book = new LogBook(5, 'debug');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    book.logger('x').info('m', circular);
    expect(book.list()[0]!.detail).toBe('[object Object]');
  });
});

describe('i18n', () => {
  it('ships every locale with a name', () => {
    expect(Object.keys(DICTIONARIES).sort()).toEqual([...LOCALES].sort());
    for (const locale of LOCALES) expect(LANGUAGE_NAMES[locale]).toBeTruthy();
  });

  it('translates with plurals and placeholders', () => {
    expect(translate('en', 'post.files', { count: 1 })).toBe('1 file');
    expect(translate('en', 'post.files', { count: 1200 })).toBe('1,200 files');
    expect(translate('ru', 'post.files', { count: 3 })).toBe('3 файла');
    expect(translate('ru', 'post.files', { count: 5 })).toBe('5 файлов');
    expect(translate('ja', 'post.files', { count: 2 })).toBe('2 個のファイル');
    expect(translate('de', 'toast.queuedCreator', { name: 'Histy' })).toBe(
      'Alle Beiträge von Histy sind in der Warteschlange',
    );
  });

  it('falls back to English, then to the key', () => {
    expect(translate('fr', 'no.such.key')).toBe('no.such.key');
    expect(translate('en', 'jobs.progress', { done: 1 })).toBe('1 of {total} done');
  });

  it('formats numbers, sizes, durations and dates', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.50 KB');
    expect(formatBytes(21334766)).toBe('20.3 MB');
    expect(formatBytes(5 * 1024 ** 4)).toBe('5.00 TB');
    expect(formatNumber(1234567, 'de')).toBe('1.234.567');
    expect(formatDuration(5_000)).toBe('5s');
    expect(formatDuration(125_000)).toBe('2m 5s');
    expect(formatDuration(3_725_000)).toBe('1h 2m');
    const now = Date.UTC(2026, 10, 17);
    expect(formatRelative(now - 10_000, 'en', now)).toBe('10 seconds ago');
    expect(formatRelative(now - 3 * 3600_000, 'en', now)).toBe('3 hours ago');
    expect(formatRelative(now - 2 * 86_400_000, 'en', now)).toBe('2 days ago');
    expect(formatRelative(now - 60 * 86_400_000, 'en', now)).toBe('2 months ago');
    expect(formatRelative(now - 800 * 86_400_000, 'en', now)).toBe('2 years ago');
    expect(formatRelative(now - 5 * 60_000, 'en', now)).toBe('5 minutes ago');
    expect(formatDate('2026-11-17T08:59:08')).toBe('Nov 17, 2026');
    expect(formatDate(null)).toBe('');
    expect(formatDate('garbage')).toBe('');
    expect(formatDate(Date.UTC(2026, 0, 2, 12), 'en', true)).toMatch(/^Jan 2, 2026/);
  });
});
