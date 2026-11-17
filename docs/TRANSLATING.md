# Translating

The interface ships in English, Japanese, Korean, Simplified Chinese, Spanish,
Brazilian Portuguese, Russian, German and French. Corrections from native
speakers are very welcome.

## Where the text lives

- `src/lib/i18n/locales/<locale>.json`: every message in the interface.
  English (`en.json`) is the source.
- `public/_locales/<locale>/messages.json`: only the extension name, its
  store description (at most 132 characters) and the keyboard shortcut
  descriptions.

## Rules

- Keep `{placeholders}` exactly as they are; they are filled in at runtime.
  Token examples such as `{published:YYYY-MM-DD}` are shown literally.
- Plurals use CLDR categories as key suffixes. A language needs the forms its
  rules define:
  - English, German: `_one`, `_other`
  - Spanish, French, Portuguese: `_one`, `_many`, `_other`
  - Russian: `_one`, `_few`, `_many`, `_other`
  - Japanese, Korean, Chinese: `_other` only
- Keep the tone plain and short. No emojis.
- Brand names stay as they are: Pawchive, Pawchive Downloader, Patreon,
  Fanbox, ZIP.

## Checking your work

```bash
pnpm lint:locales
```

The checker reports missing or extra keys, missing plural forms, lost
placeholders and empty strings.

## Adding a language

1. Add the code to `LOCALES` in `src/lib/settings.ts`, its native name and
   BCP 47 tag in `src/lib/i18n/index.ts`, and import the dictionary there.
2. Add the code to `LOCALES` in `scripts/check-locales.mjs`.
3. Create `src/lib/i18n/locales/<locale>.json` and
   `public/_locales/<locale>/messages.json`.

`scripts/expand-locale.mjs` can generate a dictionary from a compact source
where each plural message is written once as a string or an array of forms.
