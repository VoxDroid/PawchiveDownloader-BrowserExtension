# Security Policy

## Supported versions

Security fixes go into the latest release only. Please keep the extension up
to date.

| Version        | Supported |
| -------------- | --------- |
| Latest release | Yes       |
| Older releases | No        |

## Reporting a vulnerability

Please report vulnerabilities privately, never in a public issue.

- **GitHub**: on the repository's
  [Security tab](https://github.com/VoxDroid/PawchiveDownloader-BrowserExtension/security/advisories/new),
  choose **Report a vulnerability**. Only the maintainers can see it.
- **Email**: [izeno.contact@gmail.com](mailto:izeno.contact@gmail.com).

Include what the issue is, how to reproduce it, which browser and version you
used, and its impact.

You can expect an acknowledgement within 48 hours, an assessment within
7 days, and a fix for confirmed critical issues as soon as possible, usually
within 14 days. With your permission you will be credited in the release
notes.

## Scope

In scope: the extension's code, its handling of data from Pawchive (file
names, HTML, JSON), the permissions it requests, and the build and release
pipeline.

Out of scope: Pawchive itself, and issues that need a compromised browser or
operating system.

## Design notes

- The extension only talks to `pawchive.pw` and its subdomains.
- Every file name from the site is sanitized; `..` and absolute paths can
  never leave the downloads folder.
- Post HTML is never injected into extension pages; text is converted to
  plain text, and the saved `content.html` is a file on disk only.
- No remote code is loaded; the font and all scripts are bundled.
