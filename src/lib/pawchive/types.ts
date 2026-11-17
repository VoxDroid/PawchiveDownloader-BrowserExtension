/**
 * Shapes of the Pawchive JSON API (a Kemono fork) as observed on pawchive.pw,
 * and the normalized models the rest of the extension works with.
 */

/** A file entry as the API returns it. Empty object when a post has no file. */
export interface RawFile {
  name?: string;
  path?: string;
  /** Media server that holds the full file, e.g. `https://n1.pawchive.pw`. */
  server?: string;
  /** The site only keeps the thumbnail; the full file is not on its servers. */
  preview_only?: boolean;
}

export interface RawPost {
  id: string;
  user: string;
  service: string;
  title?: string | null;
  content?: string | null;
  /** Listing endpoints send a short HTML excerpt instead of `content`. */
  substring?: string | null;
  embed?: Record<string, unknown> | null;
  shared_file?: boolean;
  added?: string | null;
  published?: string | null;
  edited?: string | null;
  file?: RawFile | null;
  attachments?: RawFile[] | null;
  tags?: string[] | null;
  preview_state?: string | null;
  has_full?: boolean;
  next?: string | null;
  prev?: string | null;
}

export interface RawProfile {
  id: string;
  name: string;
  service: string;
  public_id?: string | null;
  indexed?: string | number | null;
  updated?: string | number | null;
}

export type Service = string;

export type FileCategory = 'image' | 'video' | 'audio' | 'archive' | 'document' | 'text' | 'other';

/** Where a file came from inside a post. */
export type FileRole = 'file' | 'attachment' | 'inline';

export interface PostFile {
  /** 1-based position among the post's unique files, used for numbering. */
  index: number;
  role: FileRole;
  /** Original file name as uploaded, e.g. `Screenshot (1790).png`. */
  name: string;
  /** Lower-case extension without the dot, may be empty. */
  ext: string;
  /** Content hash taken from the storage path (sha256 hex) when available. */
  hash: string | null;
  /** Server path as the API sent it, e.g. `/264/bb/64bb...png`. */
  path: string;
  /** Direct download URL, or null when the site only has a preview. */
  url: string | null;
  /** Thumbnail URL on img.pawchive.pw, or null for non-image files. */
  thumbnailUrl: string | null;
  previewOnly: boolean;
  category: FileCategory;
}

export interface Post {
  id: string;
  service: Service;
  creatorId: string;
  title: string;
  contentHtml: string;
  published: string | null;
  added: string | null;
  edited: string | null;
  tags: string[];
  files: PostFile[];
  url: string;
  nextId: string | null;
  prevId: string | null;
}

export interface Creator {
  id: string;
  service: Service;
  name: string;
  publicId: string | null;
  url: string;
  iconUrl: string;
  bannerUrl: string;
  updated: string | null;
}

/** A temporary, signed link to the full version of a preview-only file. */
export interface RelayLink {
  url: string;
  /** Unix epoch milliseconds after which the link stops working, if known. */
  expiresAt: number | null;
  /** File name the page offers for the download. */
  name: string | null;
}

export type PageRef =
  | { kind: 'post'; service: Service; creatorId: string; postId: string }
  | { kind: 'creator'; service: Service; creatorId: string; offset: number; query: string | null }
  | { kind: 'listing'; offset: number; query: string | null }
  | { kind: 'other' };
