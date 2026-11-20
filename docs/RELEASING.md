# Releasing

The source here is free to build. Official, ready-made packages are built in
the private **PawchiveDownloader-BrowserExtension-Releases** repository from a
version tag of this repository, the same way as the desktop app's official
builds, and are offered on [Ko-fi](https://ko-fi.com/izeno).

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

5. In PawchiveDownloader-BrowserExtension-Releases, run **Actions > Build
   official release** with the tag. It checks that the tag matches
   `package.json`, runs the checks and tests, builds the Chrome, Edge and
   Firefox packages, gets the Firefox package signed by Mozilla (unlisted), and
   attaches one zip per browser to a draft release, together with the Ko-fi
   images and listing texts.

## Testing the desktop app bridge

`tests/unit/bridge-contract.test.ts` drives the real desktop app's bridge from
the extension's client. It is skipped unless `BRIDGE_CONTRACT_DIR` is set; the
app's side writes the port and a pairing code to that folder and checks what
arrives. See the test for details.

## Store listing notes

- Single purpose: download posts and files from Pawchive, Kemono and Coomer.
- Permission reasons are listed in [PRIVACY.md](../PRIVACY.md).
- Mozilla's linter reports two `innerHTML` warnings from Svelte's compiled
  runtime, which clones static templates; no site data is assigned to
  `innerHTML`.
