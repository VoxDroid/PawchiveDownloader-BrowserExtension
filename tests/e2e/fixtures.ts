import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const EXTENSION = resolve('.output/chrome-mv3');
const FIXTURES = resolve('tests/fixtures');
// The service worker's `chrome` global, as far as these tests use it.
declare const chrome: { downloads: { download: (options: unknown) => Promise<number> } };

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export const POST_URL = 'https://pawchive.pw/patreon/user/2581747/post/175580645';
export const CREATOR_URL = 'https://pawchive.pw/patreon/user/2581747';

function postPage(title: string): string {
  return `<!doctype html><html><head><title>${title} | Pawchive</title></head><body><main><h1>${title}</h1><p>Mock page</p></main></body></html>`;
}

function creatorPage(): string {
  const cards = [175580645, 175180194, 175000001]
    .map(
      (
        id,
      ) => `<article class="post-card" data-id="${id}" data-service="patreon" data-user="2581747">
        <a href="/patreon/user/2581747/post/${id}"><header class="post-card__header">Post ${id}</header></a>
      </article>`,
    )
    .join('');
  return `<!doctype html><html><head><title>Posts of Histy | Pawchive</title></head><body><main>${cards}</main></body></html>`;
}

/** Serves a small, fake Pawchive so tests never touch the real site. */
async function mockSite(context: BrowserContext): Promise<void> {
  const post = JSON.parse(readFileSync(join(FIXTURES, 'post-full.json'), 'utf8'));
  await context.route(/^https:\/\/([a-z0-9]+\.)?pawchive\.pw\//, async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.hostname !== 'pawchive.pw')
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (url.pathname.endsWith('/profile'))
      return json({ id: '2581747', name: 'Histy', service: 'patreon' });
    if (url.pathname.endsWith('/posts')) {
      const offset = Number(url.searchParams.get('o') ?? 0);
      return json(
        offset > 0
          ? []
          : [
              post,
              { ...post, id: '175180194', title: 'Second post' },
              { ...post, id: '175000001', title: 'Text only', file: {}, attachments: [] },
            ],
      );
    }
    if (url.pathname.startsWith('/api/v1/')) return json(post);
    if (url.pathname.startsWith('/icons/') || url.pathname.startsWith('/banners/')) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    }
    if (url.pathname.includes('/post/'))
      return route.fulfill({ status: 200, contentType: 'text/html', body: postPage(post.title) });
    if (url.pathname === '/patreon/user/2581747')
      return route.fulfill({ status: 200, contentType: 'text/html', body: creatorPage() });
    return route.fulfill({ status: 200, contentType: 'text/html', body: postPage('Pawchive') });
  });
}

export interface Fixtures {
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext(
      mkdtempSync(join(tmpdir(), 'pdl-e2e-')),
      {
        headless: true,
        executablePath: process.env.PDL_BROWSER || undefined,
        channel: process.env.PDL_BROWSER ? undefined : 'chromium',
        args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
      },
    );
    await mockSite(context);
    await use(context);
    await context.close();
  },
  worker: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent('serviceworker');
    // Record downloads instead of writing files.
    await worker.evaluate(() => {
      const calls: unknown[] = [];
      (globalThis as unknown as { __downloads: unknown[] }).__downloads = calls;
      chrome.downloads.download = (options: unknown) => {
        calls.push(options);
        return Promise.resolve(calls.length + 1000);
      };
    });
    await use(worker);
  },
  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },
});

export const expect = test.expect;

export async function recordedDownloads(
  worker: Worker,
): Promise<Array<{ url: string; filename: string }>> {
  return worker.evaluate(
    () =>
      (globalThis as unknown as { __downloads: Array<{ url: string; filename: string }> })
        .__downloads,
  );
}
