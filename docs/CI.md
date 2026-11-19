# CI settings

The workflows adapt on their own, and you can tune them from the repository
settings without editing any YAML: **Settings > Secrets and variables >
Actions > Variables**. Leave a variable unset to use its default.

## How the CI run is decided

The first job, **Plan the run**, works out what to run and writes the plan to
the run summary.

- **Public repository:** unit tests on Ubuntu, Windows and macOS, all three
  browser builds, end-to-end tests. Actions minutes are free.
- **Private repository:** unit tests on Ubuntu only, to save minutes (macOS
  minutes count 10x and Windows 2x against the private quota). Everything
  else still runs.
- **Run everything once:** Actions > CI > Run workflow, tick **Run
  everything**. Useful before a release while the repository is private.

Switching the repository between private and public needs no changes; the next
run picks it up.

## Variables

| Variable            | Default                                             | What it changes                                                                                                |
| ------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `CI_NODE_VERSION`   | `22`                                                | Node.js version for CI and releases                                                                            |
| `CI_OSES`           | `["ubuntu-latest","windows-latest","macos-latest"]` | Unit test systems while public                                                                                 |
| `CI_OSES_PRIVATE`   | `["ubuntu-latest"]`                                 | Unit test systems while private                                                                                |
| `CI_BROWSERS`       | `["chrome","firefox","edge"]`                       | Which browser packages to build and lint                                                                       |
| `CI_E2E`            | `true`                                              | Set to `false` to skip the Playwright end-to-end tests                                                         |
| `CI_COVERAGE`       | `true`                                              | Set to `false` to skip uploading the coverage report                                                           |
| `CODEQL_ENABLED`    | unset                                               | CodeQL runs automatically while public. Set to `true` to run it while private (needs GitHub Advanced Security) |
| `PUBLISH_TO_STORES` | unset                                               | Set to `true` to submit tagged releases to the browser stores (see [RELEASING.md](RELEASING.md))               |

Lists are JSON arrays, written exactly as in the defaults, for example
`["ubuntu-latest","windows-latest"]`.

## Examples

- Private, but test on Windows too: `CI_OSES_PRIVATE` =
  `["ubuntu-latest","windows-latest"]`.
- Only build Chrome and Firefox: `CI_BROWSERS` = `["chrome","firefox"]`.
- Try a newer Node.js: `CI_NODE_VERSION` = `24`.

## Other workflows

- **Release** (`release.yml`) always runs the full checks on Ubuntu and builds
  every browser package for a tag. See [RELEASING.md](RELEASING.md).
- **CodeQL** (`codeql.yml`) scans weekly and on every push while public.
- **Dependabot** (`.github/dependabot.yml`) opens weekly update pull requests
  for npm packages and GitHub Actions.
