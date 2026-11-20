# Privacy Policy

Last updated: November 20, 2026

Pawchive Downloader does not collect, sell or share any personal data. It has
no accounts, analytics, tracking or advertising.

## What the extension stores, and where

| Data                                     | Where it lives                                                                                | Why                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Settings                                 | Your browser's extension storage, synced through your browser account if you use browser sync | To remember your preferences                                      |
| Download queue                           | Extension storage on this device                                                              | To resume downloads after a restart                               |
| History and downloaded-file fingerprints | IndexedDB on this device                                                                      | To show history, skip files you already have and mark saved posts |
| Watchlist and favorites                  | Extension storage on this device                                                              | To check creators you follow and keep your bookmarks              |
| Posts you opened (read markers)          | Extension storage on this device (the last 20,000)                                            | To mark posts you saw before                                      |
| Desktop app pairing                      | Extension storage on this device (a random token)                                             | To send downloads to Pawchive Downloader on this computer         |
| Logs                                     | Extension storage on this device (last 500 lines)                                             | To help you troubleshoot                                          |

You can clear history and file fingerprints from the History page, remove
watched creators and favorites on their pages, unpair the desktop app and turn
read markers off in Settings, clear logs on the Logs page, and reset settings
from Settings. A backup file holds your settings, watchlist, favorites, history
and read markers and is saved only where you choose. Removing the extension
deletes all of it.

## Network access

The extension contacts only:

- `pawchive.pw`, `kemono.cr` and `coomer.st` (and their old `kemono.su`,
  `kemono.party`, `coomer.su` and `coomer.party` addresses) with their media
  and thumbnail servers, to show and download the posts you choose and to
  check creators on your watchlist. Requests use your browser's normal
  session, exactly like visiting the sites.
- `127.0.0.1` (this computer only), and only after you pair it with the
  Pawchive Downloader desktop app, to hand it downloads. Nothing leaves your
  computer this way.

Outside links in posts (Mega, Google Drive and the like) are only listed and
saved to `links.txt`; the extension does not open them unless you click them.

## Permissions

- `downloads`: save files to your downloads folder.
- `storage`, `unlimitedStorage`: keep settings, queue, history, watchlist and favorites.
- `contextMenus`: right-click actions on post and creator links.
- `notifications`: tell you when downloads finish or new posts appear.
- `alarms`: check the watchlist and retry failed files on a schedule.
- `offscreen` (Chrome and Edge only): build ZIP archives.
- Access to Pawchive, Kemono and Coomer: read posts and download their files.
- Access to `127.0.0.1` (optional, asked for when you pair the desktop app).

## Contact

Questions: [izeno.contact@gmail.com](mailto:izeno.contact@gmail.com).
