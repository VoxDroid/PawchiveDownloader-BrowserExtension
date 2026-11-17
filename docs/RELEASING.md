# Releasing

Releases are built by `.github/workflows/release.yml` when a version tag is
pushed.

## Steps

1. Update `version` in `package.json`.
2. Move the notes under `## [Unreleased]` in `CHANGELOG.md` into a new
   `## [x.y.z] - YYYY-MM-DD` section and update the links at the bottom.
3. Run the full check locally:

```bash
pnpm check
```

4. Commit, tag and push:

```bash
git commit -am "Release x.y.z"
```

```bash
git tag -s vx.y.z -m "Pawchive Downloader x.y.z"
```

```bash
git push --follow-tags
```

The workflow checks that the tag matches `package.json`, runs lint, type
checks, translation checks and tests, builds the Chrome, Edge and Firefox
packages plus a source archive, lints the Firefox package with Mozilla's
linter, and publishes a GitHub release with the changelog section as notes.

To rebuild an existing tag, run the workflow manually and enter the tag.

## Submitting to the stores (optional)

Store submission is off by default. To turn it on, set the repository
variable `PUBLISH_TO_STORES` to `true` and add these secrets:

| Store            | Secrets                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Chrome Web Store | `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN` |
| Firefox Add-ons  | `FIREFOX_EXTENSION_ID`, `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET`                        |
| Edge Add-ons     | `EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, `EDGE_API_KEY`                                       |

`wxt submit` uploads the packages; see the
[WXT publishing guide](https://wxt.dev/guide/essentials/publishing.html) for
how to create the credentials. Firefox needs the source archive because the
code is bundled; it is uploaded automatically.

## Store listing notes

- Single purpose: download posts and files from Pawchive.
- Permission reasons are listed in [PRIVACY.md](../PRIVACY.md).
- Mozilla's linter reports two `innerHTML` warnings from Svelte's compiled
  runtime, which clones static templates; no site data is assigned to
  `innerHTML`.
