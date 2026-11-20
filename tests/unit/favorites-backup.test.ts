import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, createBackup, parseBackup, planRestore } from '../../src/lib/backup';
import {
  favoriteKey,
  favoritesText,
  favoriteUrl,
  parseFavorites,
  type Favorite,
} from '../../src/lib/favorites';
import { DEFAULT_SETTINGS } from '../../src/lib/settings';
import { createWatchEntry } from '../../src/lib/watch';

const fav = (over: Partial<Favorite> = {}): Favorite => ({
  key: favoriteKey('post', 'patreon@kemono', '1', '2'),
  kind: 'post',
  service: 'patreon@kemono',
  creatorId: '1',
  postId: '2',
  title: 'Set',
  note: '',
  addedAt: 1,
  ...over,
});

describe('favorites', () => {
  it('links to the right site', () => {
    expect(favoriteUrl(fav())).toBe('https://kemono.cr/patreon/user/1/post/2');
    expect(
      favoriteUrl(
        fav({ kind: 'creator', postId: null, service: 'onlyfans@coomer', creatorId: 'x' }),
      ),
    ).toBe('https://coomer.st/onlyfans/user/x');
  });

  it('round-trips the desktop app export format', () => {
    const list = [
      fav(),
      fav({
        key: favoriteKey('creator', 'fanbox', '9'),
        kind: 'creator',
        service: 'fanbox',
        creatorId: '9',
        postId: null,
        title: 'Cat\twith tab',
      }),
    ];
    const text = favoritesText(list);
    expect(text).toBe(
      'https://kemono.cr/patreon/user/1/post/2\tSet\nhttps://pawchive.pw/fanbox/user/9\tCat with tab\n',
    );
    const back = parseFavorites(text, 5);
    expect(back.map((f) => [f.key, f.title])).toEqual([
      [list[0]!.key, 'Set'],
      [list[1]!.key, 'Cat with tab'],
    ]);
  });

  it('reads KemonoDownloader lists (links only) and pasted text', () => {
    const found = parseFavorites(
      'https://kemono.su/patreon/user/1/post/2\nsee coomer.st/onlyfans/user/x and junk\n\nhttps://kemono.su/patreon/user/1/post/2',
    );
    expect(found.map((f) => f.key)).toEqual([
      favoriteKey('post', 'patreon@kemono', '1', '2'),
      favoriteKey('creator', 'onlyfans@coomer', 'x'),
    ]);
    expect(found[0]?.title).toBe('2');
  });
});

describe('backups', () => {
  const watch = createWatchEntry('fanbox', '9', 'Cat');
  const history = [
    {
      id: 'h1',
      title: 'One',
      subtitle: '',
      creator: null,
      status: 'done',
      createdAt: 1,
      finishedAt: 2,
      folder: 'Pawchive',
      files: { done: 1, failed: 0, skipped: 0 },
      bytes: 10,
      refs: [],
      errors: [],
    },
  ] as never[];

  it('saves everything and reads it back, rejecting other files', () => {
    const backup = createBackup(
      {
        settings: { ...DEFAULT_SETTINGS, theme: 'plum' },
        watchlist: [watch],
        favorites: [fav()],
        history,
        reads: ['patreon:1:2'],
      },
      new Date('2026-11-20T00:00:00Z'),
    );
    expect(backup.format).toBe(BACKUP_FORMAT);
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed?.settings.theme).toBe('plum');
    expect(parsed?.favorites).toHaveLength(1);
    expect(parseBackup('{"format":"something else"}')).toBeNull();
    expect(parseBackup('not json')).toBeNull();
  });

  it('restores what is missing and keeps what is here', () => {
    const backup = parseBackup(
      JSON.stringify(
        createBackup({
          settings: DEFAULT_SETTINGS,
          watchlist: [watch, createWatchEntry('patreon@kemono', '1', 'Dog')],
          favorites: [fav(), fav({ key: 'other', postId: '3' })],
          history,
          reads: ['a', 'b'],
        }),
      ),
    )!;
    const plan = planRestore(backup, {
      settings: DEFAULT_SETTINGS,
      watchlist: [watch],
      favorites: [fav({ note: 'mine' })],
      history,
      reads: ['b', 'c'],
    });
    expect(plan.report).toEqual({ watch: 1, favorites: 1, history: 0 });
    expect(plan.favorites.find((f) => f.key === fav().key)?.note).toBe('mine');
    expect(plan.reads).toEqual(['b', 'c', 'a']);
  });
});
