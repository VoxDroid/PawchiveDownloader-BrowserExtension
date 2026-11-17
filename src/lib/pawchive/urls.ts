import type { PageRef, RawFile, Service } from './types';

export const SITE_HOST = 'pawchive.pw';
export const SITE_ORIGIN = `https://${SITE_HOST}`;
export const THUMBNAIL_ORIGIN = `https://img.${SITE_HOST}`;
export const API_BASE = `${SITE_ORIGIN}/api/v1`;
/** Posts per page on every paginated listing. */
export const PAGE_SIZE = 50;

const SERVICE_RE = /^[a-z0-9_-]{2,32}$/i;
const ID_RE = /^[\w.-]{1,128}$/;
const HASH_FILE_RE = /^([0-9a-f]{64})(?:\.([a-z0-9]{1,10}))?$/i;

/** True for pawchive.pw and any of its subdomains (n1., img., t4., ...). */
export function isSiteHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host === SITE_HOST || host.endsWith(`.${SITE_HOST}`);
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

/** Works out what kind of Pawchive page a URL points at. */
export function parsePageUrl(url: string): PageRef {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: 'other' };
  }
  if (!isSiteHost(parsed.hostname) || parsed.hostname.split('.').length > 2) {
    return { kind: 'other' };
  }
  const parts = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const query = parsed.searchParams.get('q')?.trim() || null;
  const offset = parseOffset(parsed.searchParams.get('o'));

  if (parts.length >= 3 && parts[1] === 'user') {
    const [service, , creatorId] = parts as [string, string, string];
    if (!SERVICE_RE.test(service) || !ID_RE.test(creatorId)) return { kind: 'other' };
    if (parts.length >= 5 && parts[3] === 'post' && ID_RE.test(parts[4] ?? '')) {
      return { kind: 'post', service, creatorId, postId: parts[4] as string };
    }
    if (parts.length === 3) return { kind: 'creator', service, creatorId, offset, query };
    return { kind: 'other' };
  }
  if (parts.length === 1 && parts[0] === 'posts') return { kind: 'listing', offset, query };
  return { kind: 'other' };
}

export const pageUrls = {
  post: (service: Service, creatorId: string, postId: string) =>
    `${SITE_ORIGIN}/${encodeURIComponent(service)}/user/${encodeURIComponent(creatorId)}/post/${encodeURIComponent(postId)}`,
  creator: (service: Service, creatorId: string) =>
    `${SITE_ORIGIN}/${encodeURIComponent(service)}/user/${encodeURIComponent(creatorId)}`,
  icon: (service: Service, creatorId: string) =>
    `${SITE_ORIGIN}/icons/${encodeURIComponent(service)}/${encodeURIComponent(creatorId)}`,
  banner: (service: Service, creatorId: string) =>
    `${SITE_ORIGIN}/banners/${encodeURIComponent(service)}/${encodeURIComponent(creatorId)}`,
};

function creatorBase(service: Service, creatorId: string): string {
  return `${API_BASE}/${encodeURIComponent(service)}/user/${encodeURIComponent(creatorId)}`;
}

export const apiUrls = {
  post: (service: Service, creatorId: string, postId: string) =>
    `${creatorBase(service, creatorId)}/post/${encodeURIComponent(postId)}`,
  profile: (service: Service, creatorId: string) => `${creatorBase(service, creatorId)}/profile`,
  creatorPosts: (service: Service, creatorId: string, offset = 0, query: string | null = null) => {
    const params = new URLSearchParams({ o: String(offset) });
    if (query) params.set('q', query);
    return `${creatorBase(service, creatorId)}/posts?${params}`;
  },
  recentPosts: (offset = 0, query: string | null = null) => {
    const params = new URLSearchParams({ o: String(offset) });
    if (query) params.set('q', query);
    return `${API_BASE}/posts?${params}`;
  },
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

export function thumbnailUrl(path: string): string | null {
  const canonical = canonicalPath(path);
  return canonical ? `${THUMBNAIL_ORIGIN}/thumbnail/data${canonical}` : null;
}

/** Full-file URL for an API file entry, or null when only a preview exists. */
export function fileUrl(file: RawFile): string | null {
  // pawchive.pw itself answers 404 for /data paths: without a media server
  // there is no full file to fetch.
  if (!file.path || file.preview_only || !file.server) return null;
  const path = file.path.startsWith('/') ? file.path : `/${file.path}`;
  let origin: string;
  try {
    const server = new URL(file.server);
    if (server.protocol !== 'https:' || !isSiteHost(server.hostname)) return null;
    origin = server.origin;
  } catch {
    return null;
  }
  const dataPath = path.startsWith('/data/') ? path : `/data${path}`;
  const name = file.name ? `?f=${encodeURIComponent(file.name)}` : '';
  return `${origin}${dataPath}${name}`;
}
