import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  addHistory,
  clearHistory,
  closeDb,
  countKnown,
  historyToCsv,
  knownHashes,
  knownPosts,
  listHistory,
  postKey,
  recordDownloads,
  removeHistory,
  type HistoryEntry,
} from '../../src/lib/storage/db';
import {
  exportSettings,
  loadSettings,
  parseSettingsFile,
  resetSettings,
  saveSettings,
  watchSettings,
} from '../../src/lib/storage/settings-store';
import { DEFAULT_SETTINGS } from '../../src/lib/settings';

function entry(id: string, finishedAt: number, extra: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id,
    title: `Job ${id}`,
    subtitle: '',
    creator: { service: 'patreon', id: '1', name: 'Histy' },
    mode: 'individual',
    status: 'done',
    createdAt: finishedAt - 1000,
    startedAt: finishedAt - 900,
    finishedAt,
    postCount: 1,
    files: { done: 2, failed: 0, skipped: 1 },
    bytes: 2048,
    folder: 'Pawchive/Histy',
    refs: [{ service: 'patreon', creatorId: '1', postId: '2' }],
    errors: [],
    ...extra,
  };
}

describe('download database', () => {
  beforeEach(async () => {
    await closeDb();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('pawchive-downloader');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  });

  it('remembers downloaded files and posts', async () => {
    const post = postKey({ service: 'patreon', creatorId: '1', postId: '2' });
    expect(post).toBe('patreon:1:2');
    await recordDownloads(
      [{ hash: 'aaa', post, path: 'x/a.png', at: 1 }],
      [{ key: post, title: 'Post', at: 1 }],
    );
    await recordDownloads([], []);
    expect([...(await knownHashes(['aaa', 'bbb']))]).toEqual(['aaa']);
    expect([...(await knownHashes([]))]).toEqual([]);
    expect([...(await knownPosts([post, 'other']))]).toEqual([post]);
    expect([...(await knownPosts([]))]).toEqual([]);
    expect(await countKnown()).toEqual({ files: 1, posts: 1, history: 0 });
  });

  it('keeps history newest first and removes entries', async () => {
    await addHistory(entry('old', 1000));
    await addHistory(entry('new', 5000));
    expect((await listHistory()).map((e) => e.id)).toEqual(['new', 'old']);
    await removeHistory(['old']);
    expect((await listHistory()).map((e) => e.id)).toEqual(['new']);
  });

  it('clears history, optionally forgetting files', async () => {
    await addHistory(entry('a', 1));
    await recordDownloads([{ hash: 'h', post: 'p', path: 'f', at: 1 }], []);
    await clearHistory(false);
    expect(await countKnown()).toEqual({ files: 1, posts: 0, history: 0 });
    await clearHistory(true);
    expect(await countKnown()).toEqual({ files: 0, posts: 0, history: 0 });
  });

  it('exports CSV with quoting', () => {
    const csv = historyToCsv([entry('a', Date.UTC(2026, 10, 17), { title: 'Say "hi", world' })]);
    const [header, row] = csv.trim().split('\r\n');
    expect(header).toBe(
      'finished,title,creator,service,status,mode,posts,files_done,files_failed,files_skipped,bytes,folder',
    );
    expect(row).toBe(
      '2026-11-17T00:00:00.000Z,"Say ""hi"", world",Histy,patreon,done,individual,1,2,0,1,2048,Pawchive/Histy',
    );
  });
});

describe('settings storage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('loads defaults and saves validated changes', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    const saved = await saveSettings({ theme: 'forest', concurrency: 99 });
    expect(saved.theme).toBe('forest');
    expect(saved.concurrency).toBe(5);
    expect((await loadSettings()).theme).toBe('forest');
    expect(await resetSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('notifies watchers', async () => {
    const seen: string[] = [];
    const stop = watchSettings((s) => seen.push(s.theme));
    await saveSettings({ theme: 'plum' });
    await new Promise((r) => setTimeout(r, 0));
    stop();
    expect(seen).toContain('plum');
  });

  it('round-trips settings files', () => {
    const text = exportSettings({ ...DEFAULT_SETTINGS, theme: 'ember' });
    expect(JSON.parse(text).app).toBe('pawchive-downloader');
    expect(parseSettingsFile(text).theme).toBe('ember');
    expect(parseSettingsFile('{"theme":"light"}').theme).toBe('light');
    expect(() => parseSettingsFile('not json')).toThrow();
  });
});
