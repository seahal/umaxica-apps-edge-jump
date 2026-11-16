# Remove unused Fastly dependencies

## Scope and result

The owner deferred Fastly implementation and requested removal. Cloudflare is
already the sole implemented runtime; no Fastly source, build or deployment
entry point was found. Removed `@fastly/hono-fastly-compute` and
`@fastly/js-compute` from package.json and regenerated the lockfile with pnpm.
The Fastly / Bytecode Alliance / minimatch dependency chain is absent from the
resulting lockfile. In particular, minimatch 10.2.6 associated with
GHSA-g3hv-75wg-m249 is no longer in the selected dependency graph.

Provider-specific names in the test-only JWKS fixture were changed to
fixture-active / fixture-grace without changing key material or coverage.
docs/implementations.md records the deferred provider. Historical ADRs, plans,
evidence, explicit absence assertions and historical documentation remain.
Existing unrelated code, test and documentation edits were preserved.

## Dependency verification

Used installed pnpm 12.18.0, with XDG_RUNTIME_DIR pointing at the private
`/tmp/jump-pnpm-runtime` directory so operation locks were writable.

- Normal offline removal failed because supply-chain policy metadata for
  @babel/helper-string-parser was missing from the configured mirror cache.
- `pnpm remove --lockfile-only --offline --trust-lockfile
  @fastly/hono-fastly-compute @fastly/js-compute` succeeded. This one invocation
  trusted the existing lockfile instead of fetching policy metadata; no
  repository policy, registry or advisory-ignore configuration was changed.
  This is removal of previously locked dependencies, not a fresh security audit.
- Parsed both YAML documents of HEAD and the resulting pnpm-lock.yaml and
  compared package and snapshot maps. Toolchain document unchanged; project
  document: 184 package entries and 185 snapshot entries removed, zero added,
  zero retained entries changed. Apparent added diff lines are reordering.
- Initial frozen offline install failed with ERR_PNPM_NO_OFFLINE_TARBALL for
  Miniflare in the default writable store. It removed the installed dependency
  links before failing; the following successful install restored them.
- Copied the existing populated store's SQLite index to a temporary writable
  store and linked its content directory read-only. Then
  `pnpm install --frozen-lockfile --offline --trust-lockfile
  --store-dir /tmp/jump-recovery-store --package-import-method copy` succeeded:
  151 packages reused/copied, zero downloaded, resolution skipped, lockfile
  up to date. Source store content was not changed. No builds/scripts were
  enabled. This validates install consistency, not current supply-chain policy.
- `timeout 20 pnpm audit --prod --json` timed out with exit 124 and no advisory
  result. A clean full audit remains unverified; removal of this specific
  dependency chain does not establish absence of other vulnerabilities.

## Local checks

- `pnpm run format:check`: passed.
- `pnpm run lint:check`: passed.
- `pnpm run typecheck`: passed.
- `KNIP_DISABLE_RAW_TRANSFER=1 pnpm exec knip --include unlisted,unresolved,binaries`:
  passed; two configuration hints about redundant entry patterns, no missing
  dependency or binary findings.
- `git diff --check`: passed.

- `pnpm run test`: passed, 22 files / 2233 tests, 30.79 seconds.
- Final `pnpm run format:check`: passed on 201 files including this record.

No deployment, external configuration
change, receiver runtime validation or workerd/browser integration run occurred.
