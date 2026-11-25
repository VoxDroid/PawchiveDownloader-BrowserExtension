# Architecture

Pawchive Downloader is a Manifest V3 extension built with
[WXT](https://wxt.dev), TypeScript and Svelte 5. One code base produces the
Chrome, Edge and Firefox packages.

## The pieces

```
 pawchive.pw page                     extension
 +---------------------+   messages   +------------------------------------+
 | content script      | -----------> | background (service worker in      |
 |  - panel (Svelte,   |   live port  |  Chrome, event page in Firefox)    |
 |    shadow DOM)      | <----------- |  - DownloadEngine (job queue)      |
 |  - post card boxes  |              |  - SiteLimiter (pacing, cooldowns) |
 |  - API reads        |              |  - watchlist, menus, badge, alarms |
 +---------------------+              +-----------------+------------------+
                                                        |
 popup / dashboard (Svelte) ---- messages / live ------>|
                                                        | ZIP jobs
                                      +-----------------v------------------+
                                      | offscreen document (Chrome only)   |
                                      |  streams files into fflate ZIPs    |
                                      +------------------------------------+
```

- **Content script** (`src/entrypoints/content`). Runs on Pawchive, Kemono
  and Coomer (current and old domains), mounts the panel in a shadow root so the site's styles cannot leak in, and
  reads the API from the page's own origin so requests carry the user's
  session. It also adds selection boxes and "Saved" badges to the site's
  `article.post-card` elements.
- **Background** (`src/entrypoints/background.ts`). Owns the download engine,
  routes typed messages (`src/lib/messages.ts`), pushes live job summaries to
  every open UI over a port, checks the watchlist on an alarm, and maintains
  context menus, keyboard commands, the badge and notifications. Messages
  reach only its own handlers. With the desktop app paired, `src/lib/bridge.ts`
  hands jobs to the app on `127.0.0.1` instead (see the app's `docs/BRIDGE.md`);
  when the app answers that it no longer knows this browser, the pairing is
  forgotten here too.
- **Offscreen document** (`src/entrypoints/offscreen`). Chrome's service
  worker cannot create object URLs, so ZIP archives are built in an offscreen
  page. Before each request it asks the background to pace it, so one limiter
  still governs everything. Firefox builds archives in its background page.
- **Popup and dashboard** (`src/entrypoints/popup`, `src/entrypoints/options`).
  Svelte pages sharing components and state from `src/ui`.

## Data flow of a download

1. The panel sends `jobs:create` with a `JobRequest`: posts it already
   loaded, post references, or a whole creator.
2. The engine resolves references and creators through `PawchiveClient`,
   then `planPost` (`src/lib/jobs/plan.ts`) turns each post into items: one per
   file, a ZIP item, and text items for `content.txt`, `content.html` and
   `post.json`. Files already downloaded (by content hash) are skipped. When
   none of the posts can be loaded (offline, the site down), the job fails and
   keeps its request, so Retry looks them up again.
3. `pump()` starts pending items up to the concurrency setting. Each file
   waits for a `SiteLimiter` slot, then goes to `browser.downloads`. Preview-
   only files first look up their temporary relay link on the post page.
4. `downloads.onChanged` settles items (and `downloads.onErased`, when a
   download is removed from the browser's list). Network and server errors
   retry with jittered backoff and slow the whole site down; fatal errors fail
   at once.
5. When nothing is pending, the job is finished, recorded in IndexedDB
   history, and a notification is shown.

The queue is saved to `storage.local`, so after the browser stops the worker,
running browser downloads are re-attached and lost ones restarted.

## Pawchive specifics

- The JSON API answers only requests that send `Accept: text/css`.
- Every file entry names its media server (`server: https://n1.pawchive.pw`).
  The full URL is `server + /data + path + ?f=name`; the main domain does not
  serve `/data`.
- Storage paths carry a server prefix (`/264/bb/64bb...`), but thumbnails use
  the canonical `/64/bb/64bb...` on `img.pawchive.pw`.
- Files marked `preview_only` have no permanent URL. The post page links them
  to signed relay URLs (`t4.pawchive.pw/f/...?e=<expiry>&s=<sig>`), parsed
  without a DOM in `src/lib/pawchive/relay.ts` so it works in the worker.
- Listings page by 50 with `?o=`.

## Politeness

`SiteLimiter` (`src/lib/net/limiter.ts`) is a port of KemonoDownloader's
`download_policy.py`: first come, first served slots (at most five), a minimum
gap between starts (one second), and per-site cooldowns on `429` or `503` with
`Retry-After`, with exponential, jittered backoff otherwise. The API client
uses the same cooldowns.

## UI

- Design tokens live in `src/ui/styles/theme.css`; themes switch with
  `data-theme`, the accent with `--accent`, and `data-motion="reduced"` turns
  animations off.
- Icons are drawn as SVG from the JetBrains Mono Nerd Font's own outlines,
  each centered on its shape (`scripts/icon-paths.py` writes
  `src/ui/icon-paths.generated.ts`); as font text they sat unevenly in
  badges. The font itself is subset to Latin, Greek, Cyrillic and exactly the
  icons named in `src/ui/icon-names.json` by `scripts/subset-font.py`, which
  also generates `src/ui/icons.generated.ts`.
- Tooltips (`data-tip`) are drawn by one floating `Tooltip` component per
  page, above every container and inside the window; on the site it listens
  in the extension's shadow root.
- Long lists use `VirtualList` so creators with thousands of posts stay smooth.

## Translations

`chrome.i18n` cannot switch language at runtime, so the UI uses its own
dictionaries (`src/lib/i18n`) with CLDR plural forms. `_locales` only holds the
extension name and descriptions for the stores. See
[TRANSLATING.md](TRANSLATING.md).

## Tests

- `tests/unit`: Vitest in jsdom with WXT's fake browser. The engine is tested
  through `tests/helpers/engine-harness.ts`, which fakes the downloads API.
  ZIP tests unzip what the builder writes.
- `tests/e2e`: Playwright loads the built Chrome extension against a mocked
  Pawchive served with `context.route`, and records downloads instead of
  writing files.
