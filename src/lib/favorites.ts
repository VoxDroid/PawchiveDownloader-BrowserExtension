/**
 * Bookmarked posts and creators, kept in storage.local. The export format is
 * the desktop app's (and KemonoDownloader's): one link per line with the title
 * after a tab, so a list moves freely between the three.
 */
import { extractPageLinks, pageUrls } from './pawchive/urls';

export interface Favorite {
  key: string;
  kind: 'post' | 'creator';
  service: string;
  creatorId: string;
  postId: string | null;
  title: string;
  note: string;
  addedAt: number;
}

export function favoriteKey(
  kind: Favorite['kind'],
  service: string,
  creatorId: string,
  postId: string | null = null,
): string {
  return kind === 'post' ? `p:${service}:${creatorId}:${postId}` : `c:${service}:${creatorId}`;
}

export function favoriteUrl(f: Favorite): string {
  return f.kind === 'post' && f.postId
    ? pageUrls.post(f.service, f.creatorId, f.postId)
    : pageUrls.creator(f.service, f.creatorId);
}

/** One link per line, the title after a tab. */
export function favoritesText(list: readonly Favorite[]): string {
  return list.map((f) => `${favoriteUrl(f)}\t${f.title.replace(/[\t\n]/g, ' ')}\n`).join('');
}

/** Favorites found in a text: an exported list, or links pasted anywhere. */
export function parseFavorites(text: string, now = Date.now()): Favorite[] {
  const out: Favorite[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const [linkPart, ...rest] = line.split('\t');
    const title = rest.join(' ').trim();
    for (const { ref } of extractPageLinks(linkPart ?? '')) {
      if (ref.kind !== 'post' && ref.kind !== 'creator') continue;
      const postId = ref.kind === 'post' ? ref.postId : null;
      const key = favoriteKey(ref.kind, ref.service, ref.creatorId, postId);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        kind: ref.kind,
        service: ref.service,
        creatorId: ref.creatorId,
        postId,
        title: title || postId || ref.creatorId,
        note: '',
        addedAt: now,
      });
    }
  }
  return out;
}
