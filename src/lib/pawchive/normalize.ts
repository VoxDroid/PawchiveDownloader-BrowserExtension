import type {
  Creator,
  FileCategory,
  FileRole,
  Post,
  PostFile,
  RawFile,
  RawPost,
  RawProfile,
} from './types';
import { fileUrl, hashFromPath, isSiteUrl, pageUrls, thumbnailUrl } from './urls';

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

function buildFile(raw: RawFile, role: FileRole, index: number): PostFile | null {
  if (!raw.path) return null;
  const info = hashFromPath(raw.path);
  const name = raw.name?.trim() || raw.path.split('/').pop() || `file-${index}`;
  const ext = extensionOf(name) || info?.ext || '';
  const url = fileUrl(raw);
  return {
    index,
    role,
    name,
    ext,
    hash: info?.hash ?? null,
    path: raw.path,
    url,
    thumbnailUrl: THUMBNAIL_EXTENSIONS.has(ext) ? thumbnailUrl(raw.path) : null,
    previewOnly: url === null,
    category: categoryOf(ext),
  };
}

const IMG_SRC_RE = /<img\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/gi;

/** Images embedded in the post body that live on Pawchive's own servers. */
export function inlineImages(contentHtml: string): RawFile[] {
  const found: RawFile[] = [];
  for (const match of contentHtml.matchAll(IMG_SRC_RE)) {
    const src = decodeEntities(match[2] ?? '').trim();
    if (!src) continue;
    if (src.startsWith('/data/') || src.startsWith('/')) {
      if (!hashFromPath(src)) continue;
      const path = src.replace(/^\/data/, '').split('?')[0] as string;
      found.push({ path, name: path.split('/').pop(), preview_only: true });
      continue;
    }
    if (!isSiteUrl(src)) continue;
    const url = new URL(src);
    const path = url.pathname.replace(/^\/data/, '');
    if (!hashFromPath(path)) continue;
    const name = url.searchParams.get('f') ?? path.split('/').pop();
    found.push({ path, name: name ?? undefined, server: url.origin });
  }
  return found;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Turns an API post into the extension's model. The API repeats the main file
 * among the attachments, and the body may embed the same images again, so
 * files are de-duplicated by content hash (or path when there is none).
 */
export function normalizePost(raw: RawPost): Post {
  const contentHtml = raw.content ?? raw.substring ?? '';
  const candidates: Array<[RawFile, FileRole]> = [];
  if (raw.file && raw.file.path) candidates.push([raw.file, 'file']);
  for (const attachment of raw.attachments ?? []) candidates.push([attachment, 'attachment']);
  for (const inline of inlineImages(contentHtml)) candidates.push([inline, 'inline']);

  const seen = new Set<string>();
  const files: PostFile[] = [];
  for (const [rawFile, role] of candidates) {
    const file = buildFile(rawFile, role, files.length + 1);
    if (!file) continue;
    const key = file.hash ?? file.path;
    if (seen.has(key)) continue;
    seen.add(key);
    files.push(file);
  }

  return {
    id: String(raw.id),
    service: raw.service,
    creatorId: String(raw.user),
    title: (raw.title ?? '').trim(),
    contentHtml,
    published: raw.published ?? null,
    added: raw.added ?? null,
    edited: raw.edited ?? null,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === 'string') : [],
    files,
    url: pageUrls.post(raw.service, String(raw.user), String(raw.id)),
    nextId: raw.next ?? null,
    prevId: raw.prev ?? null,
  };
}

function toIsoDate(value: string | number | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return new Date(value * 1000).toISOString();
  return value;
}

export function normalizeCreator(raw: RawProfile): Creator {
  return {
    id: String(raw.id),
    service: raw.service,
    name: raw.name?.trim() || String(raw.id),
    publicId: raw.public_id ?? null,
    url: pageUrls.creator(raw.service, String(raw.id)),
    iconUrl: pageUrls.icon(raw.service, String(raw.id)),
    bannerUrl: pageUrls.banner(raw.service, String(raw.id)),
    updated: toIsoDate(raw.updated),
  };
}

/** Converts post body HTML into readable plain text for `content.txt`. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/\r\n?/g, '\n')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*\/\s*(p|div|h[1-6]|li|blockquote|pre|tr)\s*>/gi, '\n')
      .replace(/<\s*li\b[^>]*>/gi, '- ')
      .replace(/<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>(.*?)<\/a>/gi, (_m, _q, href, text) =>
        text && text !== href ? `${text} (${href})` : href,
      )
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' '),
  )
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
