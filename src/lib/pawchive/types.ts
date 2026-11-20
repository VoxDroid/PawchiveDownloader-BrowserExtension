/**
 * Shapes of the JSON API that Pawchive, Kemono and Coomer share (they run the
 * same software), and the normalized models the rest of the extension works
 * with. Normalized services carry their site (`patreon@kemono`); see sites.ts.
 */
import type { Site } from './sites';

/** A file entry as the API returns it. Empty object when a post has no file. */
export interface RawFile {
  name?: string;
  path?: string;
  /** Media server that holds the full file, e.g. `https://n1.pawchive.pw`. Kemono and Coomer often leave it out. */
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
  next?: string | number | null;
  prev?: string | number | null;
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
  /** Thumbnail URL on the site's img. server, or null for non-image files. */
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
  /** Listings leave out some files (without a path); the full post has them. */
  incomplete: boolean;
  /** Links to outside file hosts (Mega, Google Drive...) found in the text. */
  links: string[];
  /** Archive passwords found in the text. */
  passwords: string[];
}

export interface RawComment {
  id: string | number;
  parent_id?: string | number | null;
  commenter_name?: string | null;
  content?: string | null;
  published?: string | null;
}

export interface Comment {
  id: string;
  parentId: string | null;
  author: string;
  content: string;
  published: string | null;
}

export interface RawAnnouncement {
  content?: string | null;
  published?: string | null;
  added?: string | null;
}

export interface Announcement {
  content: string;
  published: string | null;
}

/** One entry of a site's full creator list (`/api/v1/creators`). */
export interface RawCreatorEntry {
  id: string;
  name: string;
  service: string;
  favorited?: number;
  indexed?: string | number;
  updated?: string | number;
}

export interface CreatorEntry {
  id: string;
  /** Qualified with the site, like every normalized service. */
  service: Service;
  name: string;
  favorited: number;
  updated: number;
}

/** Another account of the same creator (`/links`). */
export interface LinkedAccount {
  id: string;
  service: Service;
  name: string;
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
  | { kind: 'listing'; offset: number; query: string | null; site: Site }
  | { kind: 'other' };
