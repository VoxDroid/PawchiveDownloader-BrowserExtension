import { htmlToText } from '../pawchive/normalize';
import type { Post, PostFile } from '../pawchive/types';
import { DEFAULT_SETTINGS, type Settings } from '../settings';
import {
  buildArchivePath,
  buildFilePath,
  buildFolderPath,
  type NameContext,
} from '../download/template';
import type {
  CreatorInfo,
  FileItem,
  Item,
  JobOptions,
  JobStats,
  TextItem,
  ZipEntry,
  ZipItem,
} from './types';

export function optionsFromSettings(
  settings: Settings,
  overrides: Partial<JobOptions> = {},
): JobOptions {
  const categories = Object.entries(settings.categories)
    .filter(([, on]) => on)
    .map(([category]) => category) as JobOptions['categories'];
  return {
    mode: settings.downloadMode,
    categories,
    saveContent: settings.saveContent,
    saveMetadata: settings.saveMetadata,
    previewOnly: settings.previewOnly,
    skipDownloaded: settings.skipDownloaded,
    folderTemplate: settings.folderTemplate,
    fileTemplate: settings.fileTemplate,
    archiveTemplate: settings.archiveTemplate,
    conflictAction: settings.conflictAction,
    zipMaxSizeMb: settings.zipMaxSizeMb,
    zipVideosSeparately: settings.zipVideosSeparately,
    zipSeparateOverMb: settings.zipSeparateOverMb,
    ...overrides,
  };
}

export const DEFAULT_JOB_OPTIONS: JobOptions = optionsFromSettings({ ...DEFAULT_SETTINGS });

function nameContext(
  post: Post,
  creator: CreatorInfo | null,
  file: PostFile | null,
  now: Date,
): NameContext {
  return {
    service: post.service,
    creatorId: post.creatorId,
    creatorName: creator?.name ?? post.creatorId,
    postId: post.id,
    postTitle: post.title,
    published: post.published,
    added: post.added,
    index: file?.index ?? 0,
    count: post.files.length,
    fileName: file?.name ?? '',
    ext: file?.ext ?? '',
    hash: file?.hash ?? null,
    role: file?.role ?? '',
    now,
  };
}

function previewName(file: PostFile): PostFile {
  const dot = file.name.lastIndexOf('.');
  const stem = dot > 0 ? file.name.slice(0, dot) : file.name;
  return { ...file, name: `${stem}_preview.${file.ext || 'jpg'}`, ext: file.ext || 'jpg' };
}

function metadataJson(post: Post, creator: CreatorInfo | null): string {
  return `${JSON.stringify(
    {
      id: post.id,
      service: post.service,
      creator: { id: post.creatorId, name: creator?.name ?? null },
      title: post.title,
      published: post.published,
      added: post.added,
      edited: post.edited,
      tags: post.tags,
      url: post.url,
      files: post.files.map((f) => ({
        index: f.index,
        name: f.name,
        role: f.role,
        hash: f.hash,
        url: f.url,
        previewOnly: f.previewOnly,
      })),
    },
    null,
    2,
  )}\n`;
}

function contentHtmlDocument(post: Post): string {
  const title = post.title.replace(
    /[<>&]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] as string,
  );
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>${title}</title></head>\n<body>\n<h1>${title}</h1>\n<p><a href="${post.url}">${post.url}</a></p>\n${post.contentHtml}\n</body></html>\n`;
}

function contentText(post: Post): string {
  const body = htmlToText(post.contentHtml);
  const header = [post.title, post.published ? `Published: ${post.published}` : '', post.url]
    .filter(Boolean)
    .join('\n');
  return `${header}\n\n${body}\n`;
}

interface PlannedFile {
  file: PostFile;
  path: string;
  /** Path inside a per-post archive. */
  entryName: string;
  url: string | null;
  relay: boolean;
  skip?: FileItem['skipReason'];
}

function planFile(
  post: Post,
  creator: CreatorInfo | null,
  original: PostFile,
  options: JobOptions,
  known: Set<string>,
  now: Date,
): PlannedFile {
  let file = original;
  let url = file.url;
  let relay = false;
  let skip: PlannedFile['skip'];

  if (file.previewOnly) {
    if (options.previewOnly === 'relay') relay = true;
    else if (options.previewOnly === 'thumbnail' && file.thumbnailUrl) {
      url = file.thumbnailUrl;
      file = previewName(file);
    } else skip = 'preview-only';
  }
  if (!skip && options.skipDownloaded && file.hash && known.has(file.hash)) skip = 'duplicate';

  const ctx = nameContext(post, creator, file, now);
  const path = buildFilePath(options.folderTemplate, options.fileTemplate, ctx);
  const entryName = buildFilePath('', options.fileTemplate, ctx);
  return { file, path, entryName, url, relay, skip };
}

function baseItem(post: Post) {
  return {
    post: { service: post.service, creatorId: post.creatorId, postId: post.id },
    status: 'pending' as const,
    attempts: 0,
    bytes: 0,
    totalBytes: 0,
  };
}

/**
 * Turns one post into download items: a file item per file (or a single ZIP
 * item holding them), plus the post text and metadata when asked for.
 *
 * `fileIndexes` is an explicit user selection and wins over the category
 * filter; without it the job's categories decide.
 */
export function planPost(
  post: Post,
  creator: CreatorInfo | null,
  options: JobOptions,
  fileIndexes: number[] | undefined,
  knownHashes: Set<string> = new Set(),
  now: Date = new Date(),
): Item[] {
  const chosen = fileIndexes
    ? post.files.filter((f) => fileIndexes.includes(f.index))
    : post.files.filter((f) => options.categories.includes(f.category));
  const planned = chosen.map((f) => planFile(post, creator, f, options, knownHashes, now));
  const folderCtx = nameContext(post, creator, null, now);
  const folder = buildFolderPath(options.folderTemplate, folderCtx);
  const inFolder = (name: string) => (folder ? `${folder}/${name}` : name);

  const texts: Array<{ name: string; text: string; mime: string }> = [];
  const hasContent = htmlToText(post.contentHtml).length > 0;
  if (hasContent && (options.saveContent === 'txt' || options.saveContent === 'both')) {
    texts.push({ name: 'content.txt', text: contentText(post), mime: 'text/plain' });
  }
  if (hasContent && (options.saveContent === 'html' || options.saveContent === 'both')) {
    texts.push({ name: 'content.html', text: contentHtmlDocument(post), mime: 'text/html' });
  }
  if (options.saveMetadata)
    texts.push({ name: 'post.json', text: metadataJson(post, creator), mime: 'application/json' });

  const fileItem = (p: PlannedFile): FileItem => ({
    ...baseItem(post),
    id: `${post.id}:${p.file.index}`,
    kind: 'file',
    label: p.file.name,
    path: p.path,
    source: { url: p.url, relay: p.relay, path: p.file.path, name: p.file.name },
    hash: p.file.hash,
    category: p.file.category,
    ...(p.skip ? { status: 'skipped' as const, skipReason: p.skip } : {}),
  });

  if (options.mode === 'individual') {
    const items: Item[] = planned.map(fileItem);
    for (const t of texts) {
      items.push({
        ...baseItem(post),
        id: `${post.id}:${t.name}`,
        kind: 'text',
        label: t.name,
        path: inFolder(t.name),
        text: t.text,
        mime: t.mime,
      } satisfies TextItem);
    }
    return items;
  }

  // ZIP mode: one archive per post. Skipped files are still listed so the
  // job report can say why they are missing; videos may go alongside.
  const items: Item[] = [];
  const entries: ZipEntry[] = [];
  for (const p of planned) {
    const separate = options.zipVideosSeparately && p.file.category === 'video';
    if (p.skip || separate) {
      items.push(fileItem(p));
      continue;
    }
    entries.push({
      name: p.entryName,
      source: { url: p.url, relay: p.relay, path: p.file.path, name: p.file.name },
      hash: p.file.hash,
      category: p.file.category,
    });
  }
  for (const t of texts) entries.push({ name: t.name, text: t.text, hash: null, category: 'text' });
  if (entries.some((e) => e.source)) {
    const archivePath = buildArchivePath(
      options.folderTemplate,
      options.archiveTemplate,
      folderCtx,
    );
    items.unshift({
      ...baseItem(post),
      id: `${post.id}:zip`,
      kind: 'zip',
      label: archivePath.split('/').pop() ?? 'archive.zip',
      path: archivePath,
      entries,
    } satisfies ZipItem);
  } else {
    // Nothing binary left to archive: save the texts as plain files instead.
    for (const t of texts) {
      items.push({
        ...baseItem(post),
        id: `${post.id}:${t.name}`,
        kind: 'text',
        label: t.name,
        path: inFolder(t.name),
        text: t.text,
        mime: t.mime,
      } satisfies TextItem);
    }
  }
  return items;
}

export function computeStats(items: readonly Item[]): JobStats {
  const stats: JobStats = {
    total: items.length,
    done: 0,
    failed: 0,
    skipped: 0,
    cancelled: 0,
    active: 0,
    bytes: 0,
    totalBytes: 0,
  };
  for (const item of items) {
    switch (item.status) {
      case 'done':
        stats.done += 1;
        break;
      case 'failed':
        stats.failed += 1;
        break;
      case 'skipped':
        stats.skipped += 1;
        break;
      case 'cancelled':
        stats.cancelled += 1;
        break;
      case 'active':
        stats.active += 1;
        break;
    }
    stats.bytes += item.bytes;
    stats.totalBytes += Math.max(item.totalBytes, item.bytes);
  }
  return stats;
}

/** Hashes of every file a set of posts would download (for duplicate checks). */
export function hashesOf(posts: readonly Post[]): string[] {
  return [
    ...new Set(
      posts.flatMap((p) => p.files.map((f) => f.hash).filter((h): h is string => Boolean(h))),
    ),
  ];
}
