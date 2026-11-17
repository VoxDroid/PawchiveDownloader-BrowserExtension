import { sanitizePath, sanitizeSegment } from './sanitize';

/**
 * Path templates such as `Pawchive/{creator}/{published:YYYY-MM-DD} {title}`.
 *
 * Tokens: {service} {creator} {creator_id} {post_id} {title} {published}
 * {added} {date} {index} {count} {name} {filename} {ext} {hash} {role}.
 * Date tokens take a format after a colon (YYYY MM DD HH mm ss), {index}
 * takes a zero-padding width ({index:3} -> 007) and {hash} a length.
 */

export interface NameContext {
  service: string;
  creatorId: string;
  creatorName: string;
  postId: string;
  postTitle: string;
  published: string | null;
  added: string | null;
  /** 1-based position of the file in the post. */
  index: number;
  /** Number of files in the post. */
  count: number;
  /** Original file name including extension. */
  fileName: string;
  ext: string;
  hash: string | null;
  role: string;
  /** When the download was queued; defaults to now. */
  now?: Date;
}

export const TEMPLATE_TOKENS = [
  'service',
  'creator',
  'creator_id',
  'post_id',
  'title',
  'published',
  'added',
  'date',
  'index',
  'count',
  'name',
  'filename',
  'ext',
  'hash',
  'role',
] as const;

export type TemplateToken = (typeof TEMPLATE_TOKENS)[number];

const TOKEN_RE = /\{([a-z_]+)(?::([^{}]*))?\}/gi;

export const DEFAULT_FOLDER_TEMPLATE =
  'Pawchive/{creator} ({service})/{published:YYYY-MM-DD} {title} [{post_id}]';
export const DEFAULT_FILE_TEMPLATE = '{index:2}_{filename}';
export const DEFAULT_ARCHIVE_TEMPLATE = '{creator} - {published:YYYY-MM-DD} {title} [{post_id}]';

export const FILE_TEMPLATE_PRESETS = {
  numbered: '{index:2}_{filename}',
  original: '{filename}',
  hash: '{hash}.{ext}',
  detailed: '{post_id}_{index:3}_{name}.{ext}',
} as const;

export const FOLDER_TEMPLATE_PRESETS = {
  byPost: DEFAULT_FOLDER_TEMPLATE,
  byCreator: 'Pawchive/{creator} ({service})',
  flat: 'Pawchive',
  byDate: 'Pawchive/{creator} ({service})/{published:YYYY}/{published:MM}/{title} [{post_id}]',
} as const;

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/** Parses the API's naive timestamps (`2026-11-17T08:59:08`) as UTC. */
function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const text = /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(date: Date | null, format = 'YYYY-MM-DD', utc = true): string {
  if (!date) return '';
  const parts = utc
    ? {
        Y: date.getUTCFullYear(),
        M: date.getUTCMonth() + 1,
        D: date.getUTCDate(),
        h: date.getUTCHours(),
        m: date.getUTCMinutes(),
        s: date.getUTCSeconds(),
      }
    : {
        Y: date.getFullYear(),
        M: date.getMonth() + 1,
        D: date.getDate(),
        h: date.getHours(),
        m: date.getMinutes(),
        s: date.getSeconds(),
      };
  return format.replace(/YYYY|YY|MM|DD|HH|mm|ss/g, (token) => {
    switch (token) {
      case 'YYYY':
        return String(parts.Y);
      case 'YY':
        return pad(parts.Y % 100, 2);
      case 'MM':
        return pad(parts.M, 2);
      case 'DD':
        return pad(parts.D, 2);
      case 'HH':
        return pad(parts.h, 2);
      case 'mm':
        return pad(parts.m, 2);
      default:
        return pad(parts.s, 2);
    }
  });
}

function stem(fileName: string, ext: string): string {
  if (ext && fileName.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) {
    return fileName.slice(0, -(ext.length + 1));
  }
  return fileName;
}

function tokenValue(token: string, arg: string | undefined, ctx: NameContext): string | undefined {
  switch (token.toLowerCase()) {
    case 'service':
      return ctx.service;
    case 'creator':
      return ctx.creatorName || ctx.creatorId;
    case 'creator_id':
      return ctx.creatorId;
    case 'post_id':
      return ctx.postId;
    case 'title':
      return ctx.postTitle || ctx.postId;
    case 'published':
      return formatDate(parseDate(ctx.published), arg || 'YYYY-MM-DD');
    case 'added':
      return formatDate(parseDate(ctx.added), arg || 'YYYY-MM-DD');
    case 'date':
      return formatDate(ctx.now ?? new Date(), arg || 'YYYY-MM-DD', false);
    case 'index': {
      const width = Number.parseInt(arg ?? '', 10);
      const auto = String(ctx.count).length;
      return pad(ctx.index, Number.isFinite(width) ? Math.min(Math.max(width, 1), 8) : auto);
    }
    case 'count':
      return String(ctx.count);
    case 'name':
      return stem(ctx.fileName, ctx.ext);
    case 'filename':
      return ctx.fileName;
    case 'ext':
      return ctx.ext;
    case 'hash': {
      const length = Number.parseInt(arg ?? '', 10);
      const hash = ctx.hash ?? '';
      return Number.isFinite(length) && length > 0 ? hash.slice(0, length) : hash;
    }
    case 'role':
      return ctx.role;
    default:
      return undefined;
  }
}

/** Replaces tokens; each value is made path-safe so it cannot add folders. */
export function renderTemplate(template: string, ctx: NameContext): string {
  return template.replace(TOKEN_RE, (match, token: string, arg: string | undefined) => {
    const value = tokenValue(token, arg, ctx);
    if (value === undefined) return match;
    return value === '' ? '' : sanitizeSegment(value, '').replace(/\//g, '_');
  });
}

/** Tokens in a template the renderer does not know, for validation hints. */
export function unknownTokens(template: string): string[] {
  const known = new Set<string>(TEMPLATE_TOKENS);
  const unknown = new Set<string>();
  for (const match of template.matchAll(TOKEN_RE)) {
    const token = (match[1] as string).toLowerCase();
    if (!known.has(token)) unknown.add(match[1] as string);
  }
  return [...unknown];
}

export function validateTemplate(template: string, kind: 'folder' | 'file'): string | null {
  if (!template.trim()) return kind === 'file' ? 'empty' : null;
  if (/(^|[\\/])\.\.([\\/]|$)/.test(template)) return 'parent';
  if (unknownTokens(template).length) return 'unknown';
  if ((template.match(/\{/g)?.length ?? 0) !== (template.match(/\}/g)?.length ?? 0))
    return 'braces';
  return null;
}

/** Folder + file name for one file, safe to hand to the downloads API. */
export function buildFilePath(
  folderTemplate: string,
  fileTemplate: string,
  ctx: NameContext,
): string {
  const folder = renderTemplate(folderTemplate, ctx);
  let file = renderTemplate(fileTemplate || DEFAULT_FILE_TEMPLATE, ctx)
    .replace(/[\\/]/g, '_')
    .trim();
  if (!file || file === '.' || file === `.${ctx.ext}`)
    file = ctx.fileName || `${ctx.postId}_${ctx.index}`;
  if (ctx.ext && !file.toLowerCase().endsWith(`.${ctx.ext.toLowerCase()}`))
    file = `${file}.${ctx.ext}`;
  return sanitizePath(folder ? `${folder}/${file}` : file);
}

export function buildFolderPath(folderTemplate: string, ctx: NameContext): string {
  const folder = renderTemplate(folderTemplate, ctx);
  return folder.trim() ? sanitizePath(folder) : '';
}

/** Name of a post's ZIP archive (folder template + archive template + .zip). */
export function buildArchivePath(
  folderTemplate: string,
  archiveTemplate: string,
  ctx: NameContext,
): string {
  // The archive replaces the post's own folder, so drop the last folder level
  // when it is the per-post one (it contains a post-specific token).
  const segments = folderTemplate.split('/');
  const postLevel = /\{(post_id|title|published|added)/i.test(segments[segments.length - 1] ?? '');
  const parent = postLevel ? segments.slice(0, -1).join('/') : folderTemplate;
  const folder = renderTemplate(parent, ctx);
  const name =
    renderTemplate(archiveTemplate || DEFAULT_ARCHIVE_TEMPLATE, ctx).replace(/[\\/]/g, '_') ||
    ctx.postId;
  return sanitizePath(`${folder}/${name}.zip`);
}
