import {
  apiBase,
  imageOrigin,
  isSitePageHost,
  qualify,
  siteFromHost,
  siteOrigin,
  splitService,
  thumbnailOrigin,
  type Site,
} from './sites';
import type { PageRef, RawFile, Service } from './types';

/** Pawchive, the default site. Kept for code that only ever means Pawchive. */
export const SITE_HOST = 'pawchive.pw';
export const SITE_ORIGIN = `https://${SITE_HOST}`;
/** Posts per page on every paginated listing. */
export const PAGE_SIZE = 50;

const SERVICE_RE = /^[a-z0-9_-]{2,32}$/i;
const ID_RE = /^[\w.-]{1,128}$/;
const HASH_FILE_RE = /^([0-9a-f]{64})(?:\.([a-z0-9]{1,10}))?$/i;

/** True for any supported site and its subdomains (n1., img., t4., ...). */
export function isSiteHost(hostname: string): boolean {
  return siteFromHost(hostname) !== null;
}

export function isSiteUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && isSiteHost(parsed.hostname);
  } catch {
    return false;
  }
}

function parseOffset(value: string | null): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n - (n % PAGE_SIZE) : 0;
}

/**
 * Works out what kind of page a URL points at, on any supported site. Services
 * come back qualified with their site (`patreon@kemono`).
 */
export function parsePageUrl(url: string): PageRef {
  let parsed: URL;
  try {
    const text = url.trim();
    parsed = new URL(text.includes('://') ? text : `https://${text}`);
  } catch {
    return { kind: 'other' };
  }
  // Only the site itself, not its media or image servers.
  if (!isSitePageHost(parsed.hostname)) return { kind: 'other' };
  const site = siteFromHost(parsed.hostname) as Site;
  let parts: string[];
  try {
    parts = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return { kind: 'other' };
  }
  const query = parsed.searchParams.get('q')?.trim() || null;
  const offset = parseOffset(parsed.searchParams.get('o'));

  if (parts.length >= 3 && parts[1] === 'user') {
    const [rawService, , creatorId] = parts as [string, string, string];
    if (!SERVICE_RE.test(rawService) || !ID_RE.test(creatorId)) return { kind: 'other' };
    const service = qualify(site, rawService.toLowerCase());
    if (parts.length >= 5 && parts[3] === 'post' && ID_RE.test(parts[4] ?? '')) {
      return { kind: 'post', service, creatorId, postId: parts[4] as string };
    }
    if (parts.length === 3) return { kind: 'creator', service, creatorId, offset, query };
    return { kind: 'other' };
  }
  if (parts.length === 1 && parts[0] === 'posts') return { kind: 'listing', offset, query, site };
  return { kind: 'other' };
}

const LINK_RE =
  /(?:https?:\/\/)?(?:www\.)?(?:pawchive\.pw|kemono\.(?:cr|su|party)|coomer\.(?:st|su|party))\/[^\s<>"'`]+/gi;

/** Every site link found in free text, de-duplicated in order. */
export function extractPageLinks(text: string): Array<{ link: string; ref: PageRef }> {
  const out: Array<{ link: string; ref: PageRef }> = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(LINK_RE)) {
    const link = match[0].replace(/[)\],.;]+$/, '');
    const ref = parsePageUrl(link);
    let key: string;
    if (ref.kind === 'post') key = `p:${ref.service}:${ref.creatorId}:${ref.postId}`;
    else if (ref.kind === 'creator') key = `c:${ref.service}:${ref.creatorId}:${ref.query ?? ''}`;
    else if (ref.kind === 'listing') key = `l:${ref.site}:${ref.offset}:${ref.query ?? ''}`;
    else continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ link, ref });
  }
  return out;
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

/** Page URLs. Services may carry their site (`patreon@kemono`). */
export const pageUrls = {
  post: (service: Service, creatorId: string, postId: string) => {
    const { site, bare } = splitService(service);
    return `${siteOrigin(site)}/${enc(bare)}/user/${enc(creatorId)}/post/${enc(postId)}`;
  },
  creator: (service: Service, creatorId: string) => {
    const { site, bare } = splitService(service);
    return `${siteOrigin(site)}/${enc(bare)}/user/${enc(creatorId)}`;
  },
  icon: (service: Service, creatorId: string) => {
    const { site, bare } = splitService(service);
    return `${imageOrigin(site)}/icons/${enc(bare)}/${enc(creatorId)}`;
  },
  banner: (service: Service, creatorId: string) => {
    const { site, bare } = splitService(service);
    return `${imageOrigin(site)}/banners/${enc(bare)}/${enc(creatorId)}`;
  },
  recent: (site: Site) => `${siteOrigin(site)}/posts`,
  creators: (site: Site) => `${siteOrigin(site)}/artists`,
};

function creatorBase(service: Service, creatorId: string): string {
  const { site, bare } = splitService(service);
  return `${apiBase(site)}/${enc(bare)}/user/${enc(creatorId)}`;
}

function paged(base: string, offset: number, query: string | null): string {
  const params = new URLSearchParams({ o: String(offset) });
  if (query) params.set('q', query);
  return `${base}?${params}`;
}

/** API URLs. Services may carry their site (`patreon@kemono`). */
export const apiUrls = {
  post: (service: Service, creatorId: string, postId: string) =>
    `${creatorBase(service, creatorId)}/post/${enc(postId)}`,
  comments: (service: Service, creatorId: string, postId: string) =>
    `${creatorBase(service, creatorId)}/post/${enc(postId)}/comments`,
  profile: (service: Service, creatorId: string) => `${creatorBase(service, creatorId)}/profile`,
  linked: (service: Service, creatorId: string) => `${creatorBase(service, creatorId)}/links`,
  announcements: (service: Service, creatorId: string) =>
    `${creatorBase(service, creatorId)}/announcements`,
  creatorPosts: (service: Service, creatorId: string, offset = 0, query: string | null = null) =>
    paged(`${creatorBase(service, creatorId)}/posts`, offset, query),
  recentPosts: (offset = 0, query: string | null = null, site: Site = 'pawchive') =>
    paged(`${apiBase(site)}/posts`, offset, query),
  creators: (site: Site) => `${apiBase(site)}/creators`,
};

/** The sha256 file name at the end of a storage path, if it has one. */
export function hashFromPath(path: string): { hash: string; ext: string } | null {
  const last = path.split('/').pop() ?? '';
  const match = HASH_FILE_RE.exec(last);
  if (!match) return null;
  return { hash: (match[1] as string).toLowerCase(), ext: (match[2] ?? '').toLowerCase() };
}

/**
 * Storage paths carry a server-specific prefix (`/264/bb/64bb...` on n1), but
 * thumbnails always live under the canonical `/64/bb/64bb...` layout.
 */
export function canonicalPath(path: string): string | null {
  const info = hashFromPath(path);
  if (!info) return null;
  const { hash, ext } = info;
  return `/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}${ext ? `.${ext}` : ''}`;
}

export function thumbnailUrl(path: string, site: Site = 'pawchive'): string | null {
  const canonical = canonicalPath(path);
  return canonical ? `${thumbnailOrigin(site)}/thumbnail/data${canonical}` : null;
}

/**
 * Full-file URL for an API file entry, or null when only a preview exists.
 * pawchive.pw itself answers 404 for /data paths, so a Pawchive file needs its
 * media server; Kemono and Coomer send the request on from the site itself.
 */
export function fileUrl(file: RawFile, site: Site = 'pawchive'): string | null {
  if (!file.path || file.preview_only) return null;
  let origin: string;
  if (file.server) {
    try {
      const server = new URL(file.server);
      if (server.protocol !== 'https:' || siteFromHost(server.hostname) !== site) return null;
      origin = server.origin;
    } catch {
      return null;
    }
  } else if (site === 'pawchive') {
    return null;
  } else {
    origin = siteOrigin(site);
  }
  const path = file.path.startsWith('/') ? file.path : `/${file.path}`;
  const dataPath = path.startsWith('/data/') ? path : `/data${path}`;
  const name = file.name ? `?f=${encodeURIComponent(file.name)}` : '';
  return `${origin}${dataPath}${name}`;
}
