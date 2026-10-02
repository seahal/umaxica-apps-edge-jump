# Dependency update attempt

Attempted to resolve the two High undici advisories reported in the CI
dependency audit by updating the Wrangler dependency chain. No successful
dependency update was obtained; package.json, pnpm-workspace.yaml and
pnpm-lock.yaml remain unchanged.

## Observed blocker

- `timeout 25s pnpm view wrangler version dependencies.miniflare --json`
  timed out (exit 124) without metadata.
- `timeout 35s pnpm update wrangler` could not fetch package archives from
  the configured `https://npm.flatt.tech/` registry: DNS errors (`no connections
available`). The command was interrupted (exit 130).
- `curl -I --max-time 8 https://registry.npmjs.org/wrangler` also failed DNS
  resolution (exit 6), so the public registry was not an available fallback.
- `timeout 15s pnpm audit --audit-level=high` timed out (exit 124) without a
  result. The advisories from the prior CI investigation remain unresolved.

The attempted update began rebuilding node_modules before failing. Offline
installation from several candidate stores failed with missing cached archive
errors. The existing environment was restored successfully with
`pnpm install --frozen-lockfile --offline --store-dir /home/mslo/Projects/.pnpm-store`:
205 packages reused, no downloads, pnpm 12.0.0. Wrangler remains 4.143.0 and
the lockfile still resolves undici 7.29.0. An offline update invocation was
rejected because pnpm 12.0.0's update command does not accept `--offline`.

## Verification after restoration

Used pnpm 12.0.0 and Node 24.20.0 through their installed mise PATH entries.

- `pnpm run format:check`: passed (96 files before this record).
- `pnpm run lint:check`: passed.
- `pnpm run typecheck`: passed.
- `pnpm run test`: four files / 211 tests passed.
- `WRANGLER_LOG_PATH=/tmp/jump-update-wrangler.log pnpm run cloudflare:check`:
  passed, dry-run only, bundle 279.36 KiB / gzip 68.20 KiB.
- `git diff --check`: passed.

These checks validate the restored existing dependencies, not a patched
dependency set. No commit, push, deployment, workflow rerun, or audit bypass
was performed. Existing deleted files were preserved.
