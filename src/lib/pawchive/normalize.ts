import { fileHostLinks, findPasswords } from './links';
import { qualify, siteFromUrl, type Site } from './sites';
import { decodeEntities, htmlToText } from './text';
import type {
  Announcement,
  Comment,
  Creator,
  CreatorEntry,
  FileCategory,
  FileRole,
  LinkedAccount,
  Post,
  PostFile,
  RawAnnouncement,
  RawComment,
  RawCreatorEntry,
  RawFile,
  RawPost,
  RawProfile,
} from './types';
import { fileUrl, hashFromPath, pageUrls, thumbnailUrl } from './urls';

export { htmlToText };

const CATEGORY_EXTENSIONS: Record<Exclude<FileCategory, 'other'>, readonly string[]> = {
  image: [
    'jpg',
    'jpeg',
    'png',
    'gif',
    'webp',
    'avif',
    'bmp',
    'tif',
    'tiff',
    'jfif',
    'heic',
    'psd',
    'clip',
    'svg',
  ],
  video: ['mp4', 'm4v', 'webm', 'mkv', 'mov', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'ts'],
  audio: ['mp3', 'wav', 'flac', 'ogg', 'oga', 'm4a', 'aac', 'opus', 'wma'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zst', 'lzh'],
  document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'epub', 'rtf'],
  text: ['txt', 'md', 'json', 'csv', 'html', 'htm', 'xml', 'srt', 'ass', 'vtt'],
};

const EXT_TO_CATEGORY = new Map<string, FileCategory>(
  Object.entries(CATEGORY_EXTENSIONS).flatMap(([category, exts]) =>
    exts.map((ext) => [ext, category as FileCategory] as const),
  ),
);

/** Categories in the order the UI lists them. */
export const FILE_CATEGORIES: readonly FileCategory[] = [
  'image',
  'video',
  'audio',
  'archive',
  'document',
  'text',
  'other',
];

/** Thumbnails exist only for these; the server answers 404 for anything else. */
const THUMBNAIL_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'jfif']);

export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

export function categoryOf(ext: string): FileCategory {
  return EXT_TO_CATEGORY.get(ext.toLowerCase()) ?? 'other';
}

function buildFile(site: Site, raw: RawFile, role: FileRole, index: number): PostFile | null {
  if (!raw.path) return null;
  const info = hashFromPath(raw.path);
  const name = raw.name?.trim() || raw.path.split('/').pop() || `file-${index}`;
  const ext = extensionOf(name) || info?.ext || '';
  const url = fileUrl(raw, site);
  return {
    index,
    role,
    name,
    ext,
    hash: info?.hash ?? null,
    path: raw.path,
    url,
    thumbnailUrl: THUMBNAIL_EXTENSIONS.has(ext) ? thumbnailUrl(raw.path, site) : null,
    previewOnly: url === null,
    category: categoryOf(ext),
  };
}

const IMG_SRC_RE = /<img\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/gi;

/**
 * Images embedded in the post body that live on the site's own servers. On
 * Pawchive a bare `/data/...` path is only a preview; Kemono and Coomer serve
 * the full file there.
 */
export function inlineImages(contentHtml: string, site: Site = 'pawchive'): RawFile[] {
  const found: RawFile[] = [];
  for (const match of contentHtml.matchAll(IMG_SRC_RE)) {
    const src = decodeEntities(match[2] ?? '').trim();
    if (!src) continue;
    if (src.startsWith('/data/') || src.startsWith('/')) {
      if (!hashFromPath(src)) continue;
      const path = src.replace(/^\/data/, '').split('?')[0] as string;
      found.push({
        path,
        name: path.split('/').pop(),
        ...(site === 'pawchive' ? { preview_only: true } : {}),
      });
      continue;
    }
    if (siteFromUrl(src) === null) continue;
    const url = new URL(src);
    const path = url.pathname.replace(/^\/data/, '');
    if (!hashFromPath(path)) continue;
    const name = url.searchParams.get('f') ?? path.split('/').pop();
    found.push({ path, name: name ?? undefined, server: url.origin });
  }
  return found;
}

/**
 * Turns an API post into the extension's model. The API repeats the main file
 * among the attachments, and the body may embed the same images again, so
 * files are de-duplicated by content hash (or path when there is none).
 */
export function normalizePost(raw: RawPost, site: Site = 'pawchive'): Post {
  const service = qualify(site, raw.service);
  const contentHtml = raw.content ?? raw.substring ?? '';
  const candidates: Array<[RawFile, FileRole]> = [];
  if (raw.file && raw.file.path) candidates.push([raw.file, 'file']);
  for (const attachment of raw.attachments ?? []) candidates.push([attachment, 'attachment']);
  for (const inline of inlineImages(contentHtml, site)) candidates.push([inline, 'inline']);

  const seen = new Set<string>();
  const files: PostFile[] = [];
  for (const [rawFile, role] of candidates) {
    const file = buildFile(site, rawFile, role, files.length + 1);
    if (!file) continue;
    const key = file.hash ?? file.path;
    if (seen.has(key)) continue;
    seen.add(key);
    files.push(file);
  }

  return {
    id: String(raw.id),
    service,
    creatorId: String(raw.user),
    title: (raw.title ?? '').trim(),
    contentHtml,
    published: raw.published ?? null,
    added: raw.added ?? null,
    edited: raw.edited ?? null,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === 'string') : [],
    files,
    url: pageUrls.post(service, String(raw.user), String(raw.id)),
    nextId: raw.next != null && raw.next !== '' ? String(raw.next) : null,
    prevId: raw.prev != null && raw.prev !== '' ? String(raw.prev) : null,
    incomplete: (raw.attachments ?? []).some((a) => !a || !a.path),
    links: fileHostLinks(contentHtml),
    passwords: findPasswords(contentHtml),
  };
}

function toIsoDate(value: string | number | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return new Date(value * 1000).toISOString();
  return value;
}

export function normalizeCreator(raw: RawProfile, site: Site = 'pawchive'): Creator {
  const service = qualify(site, raw.service);
  return {
    id: String(raw.id),
    service,
    name: raw.name?.trim() || String(raw.id),
    publicId: raw.public_id ?? null,
    url: pageUrls.creator(service, String(raw.id)),
    iconUrl: pageUrls.icon(service, String(raw.id)),
    bannerUrl: pageUrls.banner(service, String(raw.id)),
    updated: toIsoDate(raw.updated),
  };
}

function toEpochSeconds(value: string | number | undefined): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

export function normalizeCreatorEntry(raw: RawCreatorEntry, site: Site): CreatorEntry {
  return {
    id: String(raw.id),
    service: qualify(site, raw.service),
    name: (raw.name ?? '').trim() || String(raw.id),
    favorited: typeof raw.favorited === 'number' ? raw.favorited : 0,
    updated: toEpochSeconds(raw.updated ?? raw.indexed),
  };
}

export function normalizeLinkedAccount(
  raw: { id: string | number; service: string; name?: string | null },
  site: Site,
): LinkedAccount {
  return {
    id: String(raw.id),
    service: qualify(site, raw.service),
    name: raw.name?.trim() || String(raw.id),
  };
}

export function normalizeComment(raw: RawComment): Comment {
  return {
    id: String(raw.id),
    parentId: raw.parent_id != null && raw.parent_id !== '' ? String(raw.parent_id) : null,
    author: raw.commenter_name?.trim() || 'Anonymous',
    content: raw.content ?? '',
    published: raw.published ?? null,
  };
}

export function normalizeAnnouncement(raw: RawAnnouncement): Announcement {
  return { content: raw.content ?? '', published: raw.published ?? raw.added ?? null };
}
