// Renders the README screenshots from the real, built extension, driven
// against a mocked Pawchive with neutral placeholder artwork.
//
// Usage: pnpm build && node scripts/screenshots.mjs
// Set PDL_BROWSER to a Chromium-based browser that still honours
// --load-extension if Playwright's bundled Chromium cannot start.
import { chromium } from '@playwright/test';
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const EXT = resolve('.output/chrome-mv3');
const OUT = resolve('docs/screenshots');
mkdirSync(OUT, { recursive: true });

const PALETTES = [
  ['#2b1e4f', '#8b7cf6', '#f3c4fb'],
  ['#0f2e2a', '#3ccf91', '#c8f7dc'],
  ['#2e1a0f', '#f5a524', '#ffe3b3'],
  ['#0f1f3a', '#5aa9ff', '#cfe6ff'],
  ['#3a0f22', '#ff6b8b', '#ffd1dc'],
  ['#102a33', '#22d3ee', '#c9f6ff'],
];

function art(seed, w = 480, h = 480) {
  const [bg, a, b] = PALETTES[seed % PALETTES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${a}"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <circle cx="${120 + ((seed * 47) % 240)}" cy="${140 + ((seed * 31) % 180)}" r="${90 + (seed % 3) * 30}" fill="${b}" opacity="0.55"/>
    <path d="M0 ${h * 0.72} Q ${w * 0.3} ${h * (0.55 + (seed % 4) * 0.04)} ${w * 0.6} ${h * 0.7} T ${w} ${h * 0.64} V ${h} H 0 Z" fill="${bg}" opacity="0.65"/>
    <path d="M0 ${h * 0.84} Q ${w * 0.4} ${h * 0.74} ${w} ${h * 0.86} V ${h} H 0 Z" fill="${bg}"/>
  </svg>`;
  return new Resvg(svg).render().asPng();
}

const HASHES = Array.from(
  { length: 12 },
  (_, i) => `${(i + 10).toString(16).padStart(2, '0')}${'ab'.repeat(31)}`,
);
const file = (i, name) => ({
  name,
  path: `/2${HASHES[i].slice(0, 2)}/${HASHES[i].slice(2, 4)}/${HASHES[i]}.${name.split('.').pop()}`,
  server: 'https://n1.pawchive.pw',
});

function post(id, title, published, files) {
  return {
    id: String(id),
    user: '880001',
    service: 'patreon',
    title,
    content:
      '<p>A loose set of studies from this month: morning light in the pines, a few figure sketches and the full-resolution files for printing.</p><p>Thank you for the support!</p>',
    published,
    added: published,
    file: files[0] ?? {},
    attachments: files,
    tags: ['sketchbook', 'studies'],
  };
}

const MAIN = post(30120, 'Spring Sketchbook: Forest Studies', '2026-11-12T10:00:00', [
  file(0, 'forest-morning.png'),
  file(1, 'pines-study.png'),
  file(2, 'river-bend.png'),
  file(3, 'figure-sketches.png'),
  file(4, 'lantern-light.png'),
  file(5, 'canopy.png'),
  file(6, 'process-timelapse.mp4'),
  file(7, 'print-files.zip'),
]);
const TITLES = [
  'Autumn Palette Exercises',
  'Character Turnaround: Wren',
  'Brush Pack v3',
  'Coastal Plein Air',
  'Lighting Breakdown',
  'Monthly Wallpapers',
  'Ink Practice Sheets',
  'Environment Thumbnails',
  'Color Script: Night Market',
  'Gesture Drawing Set',
  'Speedpaint Collection',
  'Texture Library',
  'Desert Concepts',
  'Portrait Studies',
  'Mountain Village Keyframe',
];
const POSTS = [
  MAIN,
  ...TITLES.map((t, i) =>
    post(
      30119 - i,
      t,
      `2026-${String(10 - Math.floor(i / 3)).padStart(2, '0')}-${String(28 - (i % 3) * 7).padStart(2, '0')}T09:00:00`,
      [
        file((i + 1) % 8, `${t.toLowerCase().replace(/[^a-z]+/g, '-')}.png`),
        file((i + 3) % 8, 'extras.zip'),
      ],
    ),
  ),
];

function page(title, body) {
  return `<!doctype html><html><head><title>${title} | Pawchive</title><style>
    body{margin:0;background:#1d1f24;color:#ddd;font:15px/1.5 system-ui,sans-serif}
    header{height:56px;background:#282a2e;display:flex;align-items:center;padding:0 24px;font-weight:700;color:#fff}
    main{padding:24px 32px;max-width:1100px}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
    .post-card{background:#282a2e;border-radius:8px;overflow:hidden}
    .post-card img{width:100%;aspect-ratio:1;object-fit:cover;display:block}
    .post-card__header{padding:8px 10px;font-size:13px}
    .hero{display:flex;gap:18px;align-items:center;margin-bottom:24px}
    .hero img{width:96px;height:96px;border-radius:12px}
    .files{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:20px}
    .files img{width:100%;border-radius:8px}
  </style></head><body><header>Pawchive</header><main>${body}</main></body></html>`;
}

async function mock(context) {
  await context.route(/^https:\/\/([a-z0-9]+\.)?pawchive\.pw\//, async (route) => {
    const url = new URL(route.request().url());
    const json = (body) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    const png = (seed) => route.fulfill({ status: 200, contentType: 'image/png', body: art(seed) });
    if (url.hostname !== 'pawchive.pw') {
      const index = HASHES.findIndex((h) => url.pathname.includes(h));
      return png(index >= 0 ? index : 3);
    }
    if (url.pathname.startsWith('/icons/')) return png(1);
    if (url.pathname.startsWith('/banners/'))
      return route.fulfill({ status: 200, contentType: 'image/png', body: art(4, 1200, 300) });
    if (url.pathname.endsWith('/profile'))
      return json({
        id: '880001',
        name: 'Aster Vale',
        service: 'patreon',
        updated: '2026-11-12T10:00:00',
      });
    if (url.pathname.endsWith('/posts'))
      return json(Number(url.searchParams.get('o') ?? 0) > 0 ? [] : POSTS);
    if (url.pathname.includes('/api/v1/')) {
      const id = url.pathname.split('/').pop();
      return json(POSTS.find((p) => p.id === id) ?? MAIN);
    }
    if (url.pathname.includes('/post/')) {
      const imgs = HASHES.slice(0, 6)
        .map((h) => `<img src="https://n1.pawchive.pw/x/${h}" alt="">`)
        .join('');
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: page(
          MAIN.title,
          `<div class="hero"><img src="/icons/patreon/880001"><div><h1>${MAIN.title}</h1><div>Aster Vale</div></div></div><p>${MAIN.content}</p><div class="files">${imgs}</div>`,
        ),
      });
    }
    const cards = POSTS.slice(0, 12)
      .map(
        (p, i) =>
          `<article class="post-card" data-id="${p.id}" data-service="patreon" data-user="880001"><a href="/patreon/user/880001/post/${p.id}"><img src="https://img.pawchive.pw/t/${HASHES[i % 8]}"><header class="post-card__header">${p.title}</header></a></article>`,
      )
      .join('');
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: page(
        'Aster Vale',
        `<div class="hero"><img src="/icons/patreon/880001"><div><h1>Aster Vale</h1><div>Patreon</div></div></div><div class="grid">${cards}</div>`,
      ),
    });
  });
}

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'pdl-shots-')), {
  headless: true,
  executablePath: process.env.PDL_BROWSER || undefined,
  channel: process.env.PDL_BROWSER ? undefined : 'chromium',
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
  ],
  ignoreDefaultArgs: ['--disable-extensions'],
});
await mock(context);
let [sw] = context.serviceWorkers();
sw ??= await context.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;

// Fake transfers that progress over time; some finish, some keep running.
await sw.evaluate(() => {
  const started = new Map();
  let next = 1;
  chrome.downloads.download = async () => {
    const id = next++;
    started.set(id, Date.now());
    return id;
  };
  chrome.downloads.search = async ({ id }) => {
    const at = started.get(id);
    if (!at) return [];
    const total = 8_000_000 + (id % 5) * 3_000_000;
    const done = id % 3 !== 0 && Date.now() - at > 1500;
    const received = done ? total : Math.min(total * 0.9, ((Date.now() - at) / 9000) * total);
    return [
      { id, state: done ? 'complete' : 'in_progress', bytesReceived: received, totalBytes: total },
    ];
  };
});

const tab = await context.newPage();
const ui = tab.locator('pawchive-downloader');
const shot = async (name, target = tab) => {
  await tab.waitForTimeout(600);
  await target.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`docs/screenshots/${name}.png`);
};

await tab.goto('https://pawchive.pw/patreon/user/880001/post/30120');
await tab.waitForTimeout(800);
await ui.locator('button.fab').click();
await tab.waitForTimeout(1500);
await ui.locator('.tile').nth(6).click();
await ui
  .locator('.view')
  .first()
  .evaluate((el) => el.scrollTo(0, 0));
await shot('panel-post');

await ui.getByRole('button', { name: /Download \d+ files/ }).click();
await tab.waitForTimeout(400);
await tab.goto('https://pawchive.pw/patreon/user/880001');
await tab.waitForTimeout(800);
await ui.locator('button.fab').click();
await tab.waitForTimeout(800);
await ui.getByRole('switch', { name: 'Select posts on the page' }).click();
for (const i of [0, 1, 2, 4, 5]) await tab.locator('article.post-card').nth(i).click();
await ui.getByRole('button', { name: 'Load posts' }).click();
await tab.waitForTimeout(1500);
await shot('panel-creator');
await ui.getByRole('button', { name: /Download 5 posts/ }).click();
await tab.waitForTimeout(3500);

await sw.evaluate(async () => {
  const list = [
    ['patreon', '880001', 'Aster Vale'],
    ['fanbox', '41207', 'Mori Lantern'],
    ['patreon', '552310', 'Quill & Pine'],
  ];
  const now = Date.now();
  const watchlist = list.map(([service, creatorId, name], i) => ({
    key: `${service}:${creatorId}`,
    service,
    creatorId,
    name,
    addedAt: now - 86_400_000 * 9,
    lastCheckedAt: now - 60_000 * (12 + i * 40),
    seenIds: [],
    newPosts:
      i === 0
        ? [
            {
              id: '30121',
              title: 'Winter Sketchbook: Snow Studies',
              published: '2026-11-16T10:00:00',
              files: 9,
            },
            { id: '30122', title: 'Brush Pack v4', published: '2026-11-17T08:00:00', files: 2 },
          ]
        : [],
    error: null,
    autoDownload: i === 1,
  }));
  await chrome.storage.local.set({ watchlist });
});

const dash = await context.newPage();
for (const route of ['downloads', 'history', 'watchlist', 'settings']) {
  await dash.goto(`chrome-extension://${id}/options.html#${route}`);
  await dash.waitForTimeout(1500);
  await dash.screenshot({ path: join(OUT, `dashboard-${route}.png`) });
  console.log(`docs/screenshots/dashboard-${route}.png`);
}

const popup = await context.newPage();
await popup.setViewportSize({ width: 380, height: 560 });
await popup.goto(`chrome-extension://${id}/popup.html`);
await popup.waitForTimeout(1200);
await popup.screenshot({ path: join(OUT, 'popup.png') });
console.log('docs/screenshots/popup.png');

await context.close();
