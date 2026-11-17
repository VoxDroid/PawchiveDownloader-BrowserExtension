import { browser } from 'wxt/browser';
import { systemClock } from '../../lib/net/limiter';
import type { OffscreenMessage, OffscreenReport } from '../../lib/messages';
import { buildZip } from '../../lib/zip/builder';

/**
 * Chrome-only helper page. Builds ZIP archives (the service worker cannot
 * create object URLs) while asking the background for pacing before every
 * request, so the shared rate limiter stays in charge.
 */

const runs = new Map<string, AbortController>();
const backoffBase = 2000;

function report<T>(message: OffscreenReport): Promise<T> {
  return browser.runtime.sendMessage(message) as Promise<T>;
}

async function run(runId: string, spec: Extract<OffscreenMessage, { type: 'zip:run' }>['spec']) {
  const controller = new AbortController();
  runs.set(runId, controller);
  let lastProgress = 0;
  try {
    const result = await buildZip(
      spec,
      {
        fetch: (input, init) => fetch(input, init),
        pace: async (url, signal) => {
          const ok = await report<boolean>({ type: 'zip:pace', runId, url });
          if (!ok || signal.aborted)
            throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
        },
        note: (url, status, retryAfter) => {
          void report({ type: 'zip:note', runId, url, status, retryAfter });
          // The background applies the cooldown; the next pace() waits for it.
          return status === 429 || (status === 503 && retryAfter !== null) ? 1 : null;
        },
        backoff: (attempt) => {
          const full = Math.min(60_000, backoffBase * 2 ** attempt);
          return full / 2 + (Math.random() * full) / 2;
        },
        sleep: (ms, signal) => systemClock.sleep(ms, signal),
        progress: ({ bytes }) => {
          const now = performance.now();
          if (now - lastProgress < 250) return;
          lastProgress = now;
          void report({ type: 'zip:progress', runId, bytes });
        },
      },
      controller.signal,
    );
    return {
      ok: true as const,
      result: {
        failed: result.failed,
        deferred: result.deferred,
        parts: result.parts.map((part) => ({
          url: URL.createObjectURL(part.blob),
          size: part.size,
        })),
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      aborted: controller.signal.aborted,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    runs.delete(runId);
  }
}

browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const msg = message as OffscreenMessage;
  if (msg?.target !== 'offscreen') return false;
  switch (msg.type) {
    case 'zip:run':
      void run(msg.runId, msg.spec).then(sendResponse);
      return true;
    case 'zip:cancel':
      runs.get(msg.runId)?.abort();
      return false;
    case 'zip:release':
      for (const url of msg.urls) URL.revokeObjectURL(url);
      return false;
    case 'blob:text':
      sendResponse(URL.createObjectURL(new Blob([msg.text], { type: msg.mime })));
      return false;
  }
  return false;
});
