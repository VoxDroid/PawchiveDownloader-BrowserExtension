import { browser } from 'wxt/browser';
import type { SiteLimiter } from '../net/limiter';
import { systemClock } from '../net/limiter';
import type { ObjectUrl, ZipPort } from '../jobs/engine';
import type { OffscreenMessage, OffscreenReport } from '../messages';
import { buildZip, type ZipSpec } from './builder';

/** UTF-8 text as a data: URL, for contexts without URL.createObjectURL. */
export function textToDataUrl(text: string, mime: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${mime};charset=utf-8;base64,${btoa(binary)}`;
}

export function canCreateObjectUrls(): boolean {
  return typeof URL.createObjectURL === 'function';
}

export async function textObjectUrl(text: string, mime: string): Promise<ObjectUrl> {
  if (canCreateObjectUrls()) {
    const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
    return { url, revoke: () => setTimeout(() => URL.revokeObjectURL(url), 60_000) };
  }
  return { url: textToDataUrl(text, mime), revoke: () => undefined };
}

/**
 * Firefox runs the background as a page with a DOM, so the archive can be
 * built right there.
 */
export function localZipPort(limiter: SiteLimiter): ZipPort {
  return {
    async run(spec, hooks, signal) {
      const result = await buildZip(
        spec,
        {
          fetch: (input, init) => fetch(input, init),
          pace: (url, s) => limiter.pace(url, s),
          note: (url, status, retryAfter) => limiter.note(url, status, retryAfter),
          backoff: (attempt) => limiter.backoff(attempt),
          sleep: (ms, s) => systemClock.sleep(ms, s),
          progress: (p) => hooks.progress(p.bytes),
        },
        signal,
      );
      return {
        ...result,
        parts: result.parts.map((part) => {
          const url = URL.createObjectURL(part.blob);
          return {
            url,
            size: part.size,
            revoke: () => setTimeout(() => URL.revokeObjectURL(url), 60_000),
          };
        }),
      };
    },
  };
}

interface OffscreenApi {
  createDocument(options: { url: string; reasons: string[]; justification: string }): Promise<void>;
  hasDocument?(): Promise<boolean>;
}

declare const chrome: {
  offscreen?: OffscreenApi;
  runtime: { getContexts?(filter: { contextTypes: string[] }): Promise<unknown[]> };
};

let creating: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  const offscreen = chrome.offscreen;
  if (!offscreen) throw new Error('Offscreen documents are not supported');
  const existing = chrome.runtime.getContexts
    ? (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })).length > 0
    : await offscreen.hasDocument?.();
  if (existing) return;
  creating ??= offscreen
    .createDocument({
      url: 'offscreen.html',
      reasons: ['BLOBS'],
      justification: 'Build ZIP archives of downloaded files and hand them to the downloads API.',
    })
    .finally(() => {
      creating = null;
    });
  await creating;
}

/**
 * Chrome's service worker cannot create object URLs, so archives are built in
 * an offscreen document. It asks the background before every request so the
 * one shared rate limiter still paces everything.
 */
export function offscreenZipPort(
  limiter: SiteLimiter,
): ZipPort & { handle(message: OffscreenReport): Promise<unknown> | undefined } {
  const runs = new Map<string, { progress(bytes: number): void; signal: AbortSignal }>();
  return {
    handle(message) {
      const run = runs.get(message.runId);
      if (!run) return undefined;
      switch (message.type) {
        case 'zip:pace':
          return limiter.pace(message.url, run.signal).then(
            () => true,
            () => false,
          );
        case 'zip:note':
          return Promise.resolve(limiter.note(message.url, message.status, message.retryAfter));
        case 'zip:progress':
          run.progress(message.bytes);
          return Promise.resolve(true);
      }
    },
    async run(spec: ZipSpec, hooks, signal) {
      await ensureOffscreen();
      const runId = crypto.randomUUID();
      runs.set(runId, { progress: hooks.progress, signal });
      const onAbort = () => {
        void browser.runtime
          .sendMessage({
            target: 'offscreen',
            type: 'zip:cancel',
            runId,
          } satisfies OffscreenMessage)
          .catch(() => undefined);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        const reply = (await browser.runtime.sendMessage({
          target: 'offscreen',
          type: 'zip:run',
          runId,
          spec,
        } satisfies OffscreenMessage)) as
          | {
              ok: true;
              result: {
                parts: Array<{ url: string; size: number }>;
                failed: Array<{ name: string; error: string }>;
                deferred: Array<{ name: string; url: string; size: number }>;
              };
            }
          | { ok: false; error: string; aborted?: boolean };
        if (!reply.ok) {
          if (reply.aborted || signal.aborted)
            throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
          throw new Error(reply.error);
        }
        return {
          ...reply.result,
          parts: reply.result.parts.map((part) => ({
            ...part,
            revoke: () => {
              setTimeout(() => {
                void browser.runtime
                  .sendMessage({
                    target: 'offscreen',
                    type: 'zip:release',
                    urls: [part.url],
                  } satisfies OffscreenMessage)
                  .catch(() => undefined);
              }, 60_000);
            },
          })),
        };
      } finally {
        signal.removeEventListener('abort', onAbort);
        runs.delete(runId);
      }
    },
  };
}
