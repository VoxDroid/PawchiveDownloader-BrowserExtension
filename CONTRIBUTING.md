# Contributing

Thanks for helping improve Pawchive Downloader. Bug reports, translations,
documentation and code are all welcome.

## Before you start

- Search the [issues](https://github.com/VoxDroid/PawchiveDownloader-BrowserExtension/issues) first; someone may already be on it.
- For larger changes, open an issue to agree on the approach before writing code.
- Be kind. This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setting up

You need Node.js 20 or newer and pnpm 10.

```bash
pnpm install
```

```bash
pnpm dev
```

`pnpm dev` builds the extension, opens a fresh Chromium profile with it
loaded and reloads it as you edit. Use `pnpm dev:firefox` for Firefox.

## Making a change

1. Create a branch from `main`.
2. Keep the change focused; one topic per pull request.
3. Add or update tests. Library code under `src/lib` should stay above the
   coverage thresholds in `vitest.config.ts`.
4. If you add text to the interface, add the key to
   `src/lib/i18n/locales/en.json` and to every other locale (see
   [docs/TRANSLATING.md](docs/TRANSLATING.md)). English is fine as a
   placeholder in a pull request; say so in the description.
5. Run the full check before pushing:

```bash
pnpm check
```

For changes to the panel, popup or dashboard, also run the end-to-end tests:

```bash
pnpm build
```

```bash
pnpm test:e2e
```

## Style

- TypeScript in strict mode; Svelte 5 with runes.
- Prettier formats everything (`pnpm format`); ESLint must pass.
- No emojis in the interface or docs. Icons come from the bundled Nerd Font:
  add the glyph name to `src/ui/icon-names.json` and run
  `scripts/subset-font.py` to regenerate the font and the icon map.
- Write interface text plainly: short sentences, say what happens.
- Respect the site: never raise the request limits in `src/lib/settings.ts`
  or bypass `SiteLimiter`.

## Commit messages

Use a short imperative subject line ("Add creator date filters"), a blank
line, then what changed and why.

## Pull requests

Fill in the template, link the issue, and include screenshots for visible
changes. CI must be green before review. What CI runs is described in [docs/CI.md](docs/CI.md).
