# JWKS failure logging verification

Added structured `jump_jwks_fetch_failed` Workers logging for issuer JWKS
transport, timeout, HTTP response, and validation failures. The event excludes
JWTs, destination URLs, JWKS bodies, and raw exception messages.
Sanitized error and cause names and fixed-format cause codes remain available
to distinguish runtime subrequest failures.

Checks performed on 2026-09-12:

- `pnpm exec oxfmt src/core/fetch_jwks.ts test/jump.test.ts docs/logging.md --check`: passed.
- `pnpm run lint:check`: passed.
- `pnpm run typecheck`: passed.
- `pnpm run test`: 158 tests passed; two unrelated Dev Container invariant
  tests could not run `git ls-files` because the environment returned
  `spawnSync git EPERM`.

The unsupported `managePackageManagerVersions` workspace setting was removed.
`pnpm install` then regenerated its package-manager dependency section in the
lockfile. Both `pnpm install` and `pnpm install --frozen-lockfile` passed with
pnpm 12.0.0; the frozen install also verified all 606 lockfile entries against
the configured supply-chain policies.
