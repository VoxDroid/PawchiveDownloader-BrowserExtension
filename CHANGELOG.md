# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-11-18

First release of the rebuilt extension. Nothing is shared with the earlier
single-file version; settings and history start fresh.

### Added

- Download panel on every Pawchive post, creator and list page, opened from a
  floating button, the toolbar popup, the context menu or `Alt+Shift+D`.
- File picking with thumbnails, category filters, select all, invert and
  Shift-click ranges.
- Whole-creator downloads with a searchable, virtualized post list filtered by
  title, date range, files and download state.
- Selection boxes on the site's own post cards, with Shift-click ranges, and
  "Saved" badges on posts already downloaded.
- Separate files or ZIP archives. Archives are streamed in the browser, split
  into numbered parts below the ZIP limit, and keep videos and very large
  files beside them.
- Full files for preview-only posts through the temporary links on the post
  page.
- Post text as `content.txt` and/or `content.html`, and `post.json` metadata.
- Duplicate skipping by content hash across posts and creators.
- Folder, file and ZIP name templates with tokens, presets and a live example.
- Download queue with pause, resume, cancel, retry, live speed and time left;
  jobs survive browser restarts.
- History with search, filters, show in folder, download again and CSV or
  JSON export.
- Watchlist that checks creators on a schedule, notifies about new posts and
  can download them automatically.
- Logs page with level filters, search, copy and save.
- Dashboard, toolbar popup, six themes plus Match system, accent colors and
  reduced motion support, all in JetBrains Mono Nerd Font.
- Nine languages: English, Japanese, Korean, Simplified Chinese, Spanish,
  Brazilian Portuguese, Russian, German and French.
- Chrome, Edge and Firefox builds from one code base (Manifest V3).
- Request pacing that follows Pawchive's rules: at most five downloads at
  once, one new request per second, and shared cooldowns on rate limits.

[Unreleased]: https://github.com/VoxDroid/PawchiveDownloader-BrowserExtension/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/VoxDroid/PawchiveDownloader-BrowserExtension/releases/tag/v1.0.0
