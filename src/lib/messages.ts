import { browser } from 'wxt/browser';
import type { Job, JobRequest, JobSummary } from './jobs/types';
import type { JobAction } from './jobs/engine';
import type { HistoryEntry } from './storage/db';
import type { LogEntry } from './log';
import type { WatchEntry } from './watch';
import type { ZipSpec } from './zip/builder';

/**
 * Every request a UI can send to the background, with its response type.
 * One table keeps both sides in agreement at compile time.
 */
export interface BackgroundApi {
  'jobs:create': { req: { request: JobRequest }; res: { jobId: string } };
  'jobs:action': { req: { jobId: string; action: JobAction }; res: null };
  'jobs:all': { req: { action: 'pause' | 'resume' }; res: null };
  'jobs:clear-finished': { req: Record<string, never>; res: null };
  'jobs:list': { req: Record<string, never>; res: JobSummary[] };
  'jobs:detail': { req: { jobId: string }; res: Job | null };
  'history:list': { req: Record<string, never>; res: HistoryEntry[] };
  'history:remove': { req: { ids: string[] }; res: null };
  'history:clear': { req: { forgetFiles: boolean }; res: null };
  'history:known-hashes': { req: { hashes: string[] }; res: string[] };
  'history:known-posts': { req: { keys: string[] }; res: string[] };
  'history:stats': {
    req: Record<string, never>;
    res: { files: number; posts: number; history: number };
  };
  'history:requeue': { req: { id: string }; res: { jobId: string } | null };
  'watch:list': { req: Record<string, never>; res: WatchEntry[] };
  'watch:add': { req: { service: string; creatorId: string; name: string }; res: WatchEntry };
  'watch:remove': { req: { key: string }; res: null };
  'watch:update': {
    req: { key: string; patch: Partial<Pick<WatchEntry, 'autoDownload' | 'name'>> };
    res: null;
  };
  'watch:check': { req: { key?: string }; res: { found: number } };
  'watch:download-new': { req: { key: string }; res: { jobId: string } | null };
  'watch:mark-seen': { req: { key?: string; ids?: string[] }; res: null };
  'watch:import': { req: { lines: string[] }; res: { added: number } };
  'logs:list': { req: Record<string, never>; res: LogEntry[] };
  'logs:clear': { req: Record<string, never>; res: null };
  'app:open-dashboard': { req: { tab?: string }; res: null };
  'app:show-file': { req: { path: string }; res: boolean };
  'app:open-downloads-folder': { req: Record<string, never>; res: null };
}

export type BackgroundRequest = {
  [K in keyof BackgroundApi]: { type: K } & BackgroundApi[K]['req'];
}[keyof BackgroundApi];

export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };

export class MessageError extends Error {
  override name = 'MessageError';
}

/** Sends a request to the background and unwraps its reply. */
export async function call<K extends keyof BackgroundApi>(
  type: K,
  ...args: BackgroundApi[K]['req'] extends Record<string, never> ? [] : [BackgroundApi[K]['req']]
): Promise<BackgroundApi[K]['res']> {
  // Firefox structured-clones messages and cannot clone the proxies that
  // Svelte state is made of; a JSON round trip gives plain data everywhere
  // (Chrome serializes messages as JSON anyway).
  const message = JSON.parse(JSON.stringify({ type, ...(args[0] ?? {}) })) as BackgroundRequest;
  const reply = (await browser.runtime.sendMessage(message)) as
    Reply<BackgroundApi[K]['res']> | undefined;
  if (!reply) throw new MessageError(`No answer to ${type}`);
  if (!reply.ok) throw new MessageError(reply.error);
  return reply.data;
}

/** Messages the background sends to a tab's content script. */
export type TabMessage =
  | { type: 'panel:toggle' }
  | { type: 'panel:open' }
  | { type: 'panel:quick-download' }
  | { type: 'page:context' };

export interface PageContext {
  kind: 'post' | 'creator' | 'listing' | 'other';
  title: string;
  fileCount?: number;
  selected?: number;
}

/** Live updates pushed over the `live` port to every open UI. */
export type LiveEvent =
  | { type: 'jobs'; jobs: JobSummary[] }
  | { type: 'watch'; newCount: number }
  | { type: 'log'; entry: LogEntry };

export const LIVE_PORT = 'pdl-live';

/** Messages between the background and Chrome's offscreen document. */
export type OffscreenMessage =
  | { target: 'offscreen'; type: 'zip:run'; runId: string; spec: ZipSpec }
  | { target: 'offscreen'; type: 'zip:cancel'; runId: string }
  | { target: 'offscreen'; type: 'zip:release'; urls: string[] }
  | { target: 'offscreen'; type: 'blob:text'; text: string; mime: string };

export type OffscreenReport =
  | { type: 'zip:pace'; runId: string; url: string }
  | { type: 'zip:note'; runId: string; url: string; status: number; retryAfter: string | null }
  | { type: 'zip:progress'; runId: string; bytes: number };
