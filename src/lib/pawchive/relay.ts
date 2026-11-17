import type { PostFile, RelayLink } from './types';
import { canonicalPath, isSiteHost } from './urls';

/**
 * Preview-only files have no permanent URL. The post page instead links them
 * to a signed relay (`https://t4.pawchive.pw/f/<id>/<name>?e=<expiry>&s=<sig>`)
 * that serves the full file for a limited time. Only the HTML page carries
 * these links, so they are scraped from it.
 *
 * This parser is regex based on purpose: it has to run in Chrome's service
 * worker, which has no DOMParser.
 */

const ANCHOR_RE = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
const ATTR_RE = /([:\w-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
const IMG_RE = /<img\b([^>]*)>/i;

function attributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(ATTR_RE)) {
    const name = (match[1] as string).toLowerCase();
    attrs[name] = decode(match[3] ?? match[4] ?? match[5] ?? '');
  }
  return attrs;
}

function decode(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)));
}

export function isRelayUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      isSiteHost(parsed.hostname) &&
      /^t\d*\./i.test(parsed.hostname) &&
      parsed.pathname.startsWith('/f/')
    );
  } catch {
    return false;
  }
}

function expiryOf(url: string): number | null {
  const value = Number(new URL(url).searchParams.get('e'));
  return Number.isFinite(value) && value > 0 ? value * 1000 : null;
}

export interface RelayIndex {
  /** Keyed by canonical storage path (`/aa/bb/<hash>.<ext>`). */
  byPath: Map<string, RelayLink>;
  /** Keyed by the file name the page offers. */
  byName: Map<string, RelayLink>;
}

export function parseRelayLinks(html: string): RelayIndex {
  const index: RelayIndex = { byPath: new Map(), byName: new Map() };
  for (const match of html.matchAll(ANCHOR_RE)) {
    const attrs = attributes(match[1] ?? '');
    const href = attrs.href;
    if (!href || !isRelayUrl(href)) continue;
    const name = attrs.download?.trim() || decodeURIComponent(new URL(href).pathname.split('/').pop() ?? '') || null;
    const link: RelayLink = { url: href, expiresAt: expiryOf(href), name };

    const img = IMG_RE.exec(match[2] ?? '');
    if (img) {
      const imgAttrs = attributes(img[1] ?? '');
      const src = imgAttrs['data-src'] || imgAttrs.src;
      if (src) {
        try {
          const path = new URL(src, 'https://img.pawchive.pw').pathname.replace(/^\/thumbnail\/data/, '');
          const canonical = canonicalPath(path);
          if (canonical) index.byPath.set(canonical, link);
        } catch {
          // ignore malformed thumbnail URLs
        }
      }
    }
    if (name && !index.byName.has(name)) index.byName.set(name, link);
  }
  return index;
}

/** The relay link for a file, if the page offered one that has not expired. */
export function findRelay(index: RelayIndex, file: Pick<PostFile, 'path' | 'name'>, now = Date.now()): RelayLink | null {
  const canonical = canonicalPath(file.path);
  const link = (canonical && index.byPath.get(canonical)) || index.byName.get(file.name) || null;
  if (!link) return null;
  // Leave a minute of slack so a download does not start on a dying link.
  if (link.expiresAt !== null && link.expiresAt - 60_000 <= now) return null;
  return link;
}
