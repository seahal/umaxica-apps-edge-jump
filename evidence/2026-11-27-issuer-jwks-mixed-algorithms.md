# Mixed-algorithm issuer JWKS verification

- `pnpm run format:check`, `pnpm run lint:check`, `pnpm run typecheck` and
  `git diff --check` passed.
- `pnpm run test:e2e` passed all 37 Chromium tests. `pnpm run test:worker`
  passed its 20 signed-edge checks and runtime contract checks. Both needed
  a rerun with loopback access after the initial attempts returned `listen EPERM`.
- `pnpm run test` and `pnpm run test:cov` each passed 2,133 tests across 23
  files. V8 reported 100% statement, branch, function and line coverage.
  Regression tests verify PS256 tokens against mixed RSA/EC JWKS, reject
  ES256 tokens and ES256-only sets, reject all eight private fields on
  skipped entries, and enforce the separate 8-entry and 4-PS256-key limits.
