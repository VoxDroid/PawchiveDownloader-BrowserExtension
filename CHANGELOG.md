# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.1] - 2026-11-25

Reliability fixes from a full audit: a failed first watchlist check no longer
floods you with "new" posts, posts that could not be loaded are retried
instead of lost, a wrong file picked as settings no longer resets them, and
a pairing removed in the desktop app is noticed.

### Fixed

- **A failed first watchlist check no longer floods you with "new" posts**:
  when the first check of a creator failed (offline, the site down), the next
  good one reported their whole first page as new, and with automatic
  download on, downloaded it all. It now takes the starting point instead.
- **Posts that could not be loaded are not lost**: when none of the posts of
  a download could be loaded (offline, the site down), it finished as
  "nothing found" and Retry could do nothing; new posts of a watched creator
  were lost that way. It now fails, and Retry looks them up again.
- **Importing a file that is not settings no longer resets everything**: a
  backup or favorites file picked by mistake reset every setting to its
  default. It is now refused, and a settings file from an older version keeps
  the settings it does not name.
- **A download removed from the browser's list no longer blocks the queue**:
  its file stayed "downloading" for good and held one of the download slots.
- **Removed in the desktop app, paired here no more**: when the app no longer
  knows this browser, the extension says so ("Pair again in Settings")
  instead of claiming the app is not running, and forgets the old pairing.
- **A post with nothing to save says so**: no file picked and "Save post
  text" unticked no longer queues an empty download.
- **Creator pictures that cannot load show initials** on a color made from
  the name, and a missing banner no longer shows a broken-image symbol.
- **Search fields show focus around the whole field**, clear button
  included, not around the text only.
- **The same message shows once** instead of stacking copies.
- Messages to the background are matched to its own handlers only.

## [1.1.0] - 2026-11-24

Files deleted from disk are downloaded again, tooltips float above the panel
instead of being cut off, icons sit evenly in their badges, and the desktop
app can show which browser is connected.

### Changed

- **Icons sit in the middle of their badges**: the icons were drawn as Nerd
  Font text, whose glyphs are wider than their monospace cell, placed
  differently each and snapped to pixel rows, so icons in round and square
  badges looked unevenly placed. They are now drawn as SVG from the same
  font's outlines, each centered on its own shape, with the same look and
  size, in the popup, the settings and the panel on the site
  (`scripts/icon-paths.py`).
- **Tooltips float above everything**: they are drawn once per page, above
  every container, wrap long text and stay inside the window, like the
  desktop app's. Before, they were part of each button and were cut off by
  the panel and by scrolling lists, and long ones ran off the edge. On the
  site they live in the extension's own layer, so the page cannot hide them.
- **The desktop app shows which browser is connected**: while paired, the
  extension checks in with the app once a minute (a local request on this
  computer), so the app's Settings > Browser extension can show "Connected to
  Microsoft Edge". Pairing names Brave, Opera and Vivaldi correctly instead of
  calling them Chrome, and unpairing here removes the browser in the app too.

### Fixed

- **Deleted files were never downloaded again**: once a file was downloaded
  it was skipped forever, even after it was deleted from the folder, until
  the history was cleared. The extension now asks the browser whether each
  file is still on disk (the browser's download list re-checks its files) and
  downloads the missing ones again. Files whose download was cleared from the
  browser's list cannot be checked and still count as there; files downloaded
  before this version are treated the same way.

### Security

- **Safer post text**: HTML entities in post text and file names are decoded
  in one pass, so text that shows `&amp;lt;` is no longer turned into `<`, and
  tags are removed until none is left, so pieces like `<<b>script>` cannot form
  a new one (three code scanning alerts). An entity with an impossible number
  (such as `&#99999999;`) or a file link with broken percent-encoding no
  longer stops a post's preview-only files from being found.

## [1.0.0] - 2026-11-20

First release of the rebuilt extension, the browser companion to the
[Pawchive Downloader](https://github.com/VoxDroid/PawchiveDownloader) desktop
app. Nothing is shared with the earlier single-file version; settings and
history start fresh.

### Added

- Pawchive, Kemono and Coomer, with their old `kemono.su`, `coomer.su` and
  `.party` links. Services carry their site as in the desktop app
  (`patreon@kemono`), and a `{site}` name token puts each site in its own
  folder (the default folder template).
- Hand downloads to the desktop app: pair with the six-digit code it shows,
  then downloads, the watchlist and the app's queue (pause, resume, retry) go
  through it while it runs; with the app closed the extension downloads
  itself.
- `links.txt` with a post's outside links (Mega, Google Drive, Dropbox and
  more) and archive passwords, a Links tab listing them, `comments.txt` with
  replies, and the creator's announcements once per download.
- A check of Kemono and Coomer media servers before a download, with the
  choice to cancel, save thumbnails instead, or queue the full files; files
  that keep failing on the server's side are saved as thumbnails.
- Failed files go back in the queue by themselves after a chosen time, up to
  three times.
- Favorites with notes, import and export in the desktop app's format; read
  markers (Seen badges) on posts opened before; linked accounts on creator
  panels; one-file backup and restore of settings, watchlist, favorites,
  history and read markers.
- Blur previews and private notifications.
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
- A hand-drawn cartoon paw icon, inked procedurally in Blender
  (`scripts/draw-icon.py`), with a bolder drawing for toolbar sizes.
- Request pacing that follows Pawchive's rules: at most five downloads at
  once, one new request per second, and shared cooldowns on rate limits.

[Unreleased]: https://github.com/VoxDroid/PawchiveDownloader-BrowserExtension/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/VoxDroid/PawchiveDownloader-BrowserExtension/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/VoxDroid/PawchiveDownloader-BrowserExtension/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/VoxDroid/PawchiveDownloader-BrowserExtension/releases/tag/v1.0.0
