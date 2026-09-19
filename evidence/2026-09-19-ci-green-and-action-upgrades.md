# CI failure root cause and workflow/action upgrades

Date: 2026-09-19. Branch `develop`. Investigated why CI has been red and
brought the workflow's actions up to date.

## Root cause of the red CI

`gh run view 35438188443 --log-failed` on the most recent run
(push of 1875ad3) shows five of seven jobs failing in the same step,
`pnpm/action-setup`, before any project command ran:

```
Error: Multiple versions of pnpm specified:
  - version 10.29.3 in the GitHub Action config with the key "version"
  - version pnpm@12.0.0+sha512.9e2e3... in the package.json with the key "packageManager"
```

So the earlier finding — CI pinning pnpm 10.29.3 against `engines.pnpm
12.0.0` — was not merely a reproducibility risk; it was the failure.
Setting the action's `version:` to 12.0.0 would not have fixed it: the
action refuses whenever a version is given both in the workflow and in
`packageManager`. The `version:` input was removed instead, leaving
`packageManager` in package.json as the single source of truth.

Every job also logged `Node 20 is being deprecated. This workflow is
running with Node 24 by default.`

## Action upgrades

Latest releases resolved through the GitHub API on this date, pinned by
commit SHA with the tag as a trailing comment:

| action                     | was | now                                               |
| -------------------------- | --- | ------------------------------------------------- |
| `actions/checkout`         | v5  | v7.0.1 `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node`       | v4  | v7.0.0 `820762786026740c76f36085b0efc47a31fe5020` |
| `pnpm/action-setup`        | v4  | v6.1.0 `ea17c68df8912ef543352723c149a84f56e3d413` |
| `gitleaks/gitleaks-action` | v2  | v3.0.0 `e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e` |

Release notes reviewed for breaking changes: `checkout` v6/v7 and
`setup-node` v6/v7 are ESM/runtime migrations with no input changes used
here; `gitleaks-action` v3 is explicitly "no changes to inputs, outputs,
or behavior", node20 → node24; `pnpm/action-setup` v6.1.0 is the release
that adds pnpm v12 support, which this repository requires.

`.github/dependabot.yml` gained the `github-actions` ecosystem (weekly,
7-day cooldown) — its absence is why SHA-pinned actions drifted two to
three majors behind. The stale root `dependabot.yml` was deleted: it is
outside `.github/`, so Dependabot never read it, and it declared a `bun`
ecosystem that AGENTS.md forbids.

## Dependency versions

`pnpm outdated` reports nothing. Direct dependencies checked against the
npm registry: `hono` 4.13.8, `jose` 6.2.12, `typescript` 7.0.2, `vite`
8.3.0, `vitest` 5.0.1, `oxlint` 1.83.0, `oxfmt` 0.68.0, `esbuild`
0.28.2, `@playwright/test` 1.63.0 and `tsx` 4.23.13 are all current.
Behind but held back by the `minimumReleaseAge: 4320` (3-day) policy in
`pnpm-workspace.yaml`: `wrangler` 4.135.0, `knip` 6.37.0, `@types/node`
26.6.2, `oxlint-tsgolint` 7.0.2002, `@cloudflare/workers-types`
5.20260919.1. Left for the cooldown to release rather than overridden.

`pnpm update` moved only the transitive Fastly toolchain binding
`@andreiltd/componentize-qjs-binding-*` 0.4.4 → 0.4.5 in the lockfile.

## Workflow refactor

The four setup steps repeated in six jobs (pnpm, Node, cache, frozen
install) moved into a local composite action,
`.github/actions/pnpm-project/action.yml`; each job now reads
`- uses: ./.github/actions/pnpm-project`. The workflow went from 128
lines to 91, plus an 18-line action.

Other changes in the same pass:

- Node is taken from `node-version-file: package.json`, which
  `actions/setup-node` resolves through `volta.node`,
  `devEngines.runtime`, then `engines.node` — the last of which this
  repository pins exactly to `24.20.0`. CI no longer carries its own
  `node-version: '24'` to keep in sync.
- `dependency-audit` and `outdated-informational` merged into one
  `dependencies` job: one install instead of two, with `pnpm outdated`
  as a `continue-on-error` step rather than a `continue-on-error` job.
- `unit-and-coverage` ran `pnpm run test` and then `pnpm run test:cov`,
  which is the same suite twice. Renamed to `unit`, running `test:cov`
  only.
- Every `actions/checkout` gained `persist-credentials: false`; no job
  pushes, and checkout v7 otherwise leaves a usable token in
  `.git/config` for every later step.

Seven jobs became six. YAML for the workflow, the composite action and
`dependabot.yml` was parsed with `yaml.safe_load` to confirm it is
well-formed; `actionlint` is not installed on this machine, and the
composite action's resolution can only be confirmed by a real CI run.

## Local run of every CI job's command

- `pnpm install --frozen-lockfile` — lockfile up to date, supply-chain
  policies pass.
- `pnpm run format:check` — 85 files, correct format.
- `pnpm run lint:check`, `pnpm run typecheck` — clean.
- `pnpm exec knip --include unlisted,unresolved,binaries` — exit 0.
- `pnpm run test` — 185 tests, 4 files, passed.
- `pnpm run test:cov` — passed; statements 92.75%, branches 88.2%,
  functions 97.47%, lines 95.09%.
- `pnpm exec playwright install chromium` then `pnpm run test:e2e` — 9
  passed (the first attempt failed only because no browser was
  installed locally; CI installs it).
- `pnpm audit --audit-level=high` — no known vulnerabilities.
- `pnpm run cloudflare:check` — Wrangler 4.132.0 dry-run succeeded.

The runner-side behaviour of `pnpm/action-setup` v6.1.0 combined with
`actions/setup-node` v7 and `cache: pnpm` is NOT verified here; it can
only be confirmed by a real CI run.
