# Jump 0.3 hardening execution evidence

Date: 2026-10-03 (Asia/Tokyo). Local Hono/Workers repository only.

## Baseline and preservation

Branch `feature`; HEAD `970477e28ac170563bdad7a03800a66c64eb271f` unchanged.
No staged changes; 17 modified tracked files and three untracked files initially.
Package service version was already 0.3.0 (user change), while runtime SERVICE,
health expectations and receiver fixture still used 0.2.0. JWT schema was/is 1.
Initial tests: 515 passed in 10 files. Initial full knip reported three unused
exports (nodes/edges/isForbiddenHost) and one unused type export (PublicErrorCode).

Read AGENTS.md, CLAUDE.md import shim, scripts/configs, CI workflow/composite action,
current ADR/plans/normative docs, key rotation/recovery and receiver/privacy/logging/
production docs, test fixtures and relevant tests/source before edits. The .agents
and .codex directories contained no additional harness instructions. Baseline
status/diff and all initially dirty files were copied to a task-specific /tmp
location before changes; no reset/restore/checkout/stash/rebase occurred.

Existing package.json and pnpm-lock.yaml remain byte-identical to the baseline,
as do user changes in adapter, logging implementation, cache/fetch/handler,
coverage config, cloudflare-edges tests and existing coverage evidence. In files
with both changes, user code/test coverage changes remain; overlapping
observability/privacy prose is intentionally revised under the fixed 0.3 decisions.
Historical evidence, ADRs and 0.2 plans were not rewritten. Key rotation runbook
was reviewed and left byte-unchanged. No Rails changes or remote mutations,
commit, push, production deploy, secret/DNS or branch/ruleset changes occurred.

Initial dirty files:

- `docs/logging.md`
- `docs/operations/production-configuration.md`
- `docs/privacy.md`
- `evidence/2026-10-03-vitest-coverage.md`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `src/cloudflare.ts`
- `src/config/registry.umaxica.ts`
- `src/core/fetch_jwks.ts`
- `src/core/handle_jump.ts`
- `src/core/jwks_cache.ts`
- `src/core/normalize_url.ts`
- `src/core/verify_jwt.ts`
- `src/index.ts`
- `test/cloudflare-edges.test.ts`
- `test/core-edges.test.ts`
- `test/jump.test.ts`
- `vitest.config.ts`
- `wrangler.jsonc`

## Implemented regression contracts

Targeted RED run: six failures / 515 passes, detecting TTL 30.001/31/35 acceptance
and traces OFF. GREEN after the implementation: 521 passes; final expanded
suite: 544 passes in 11 files. Tests retain the independent 169 production policy
pairs and 20 signed runtime adapter edges. No 97,344-case matrix was introduced.
Added NUL-suffixed reuse rejection, real registered 127/128-character kids,
129-character prelookup rejection, query/reserved duplicates, WHATWG serialization
fixtures and persisted observability freeze. Fractional NumericDates, strict jose
expiry boundary and five-second nbf/iat comparisons remain covered. Clock skew
is never added to the structural TTL.

## Effective pnpm 12 configuration

The default PATH initially selected pnpm 12.4.2 and stalled during auto-version
management. Subsequent checks used the installed 12.0.0 executable explicitly.
Read `pnpm help config`, `pnpm help install`, `pnpm help audit`, `pnpm help peers`,
and local executable schema strings. Initial `pnpm config list` omitted ignored
.npmrc script/engine/package-manager settings; config get returned undefined for
ignoreScripts/pmOnFail. The supported migration was also checked against
[pnpm's pmOnFail specification](https://github.com/pnpm/pnpm.io/blob/main/docs/settings/cli.md).

Final `pnpm config get <key>` results, from 12.0.0:

| Key                          | Actual output                |
| ---------------------------- | ---------------------------- |
| pmOnFail                     | error                        |
| ignoreScripts                | true                         |
| engineStrict                 | false                        |
| registry                     | https://npm.flatt.tech/      |
| minimumReleaseAge            | 4320                         |
| minimumReleaseAgeExclude     | undefined                    |
| allowBuilds                  | esbuild=false, workerd=false |
| ignoredBuiltDependencies     | undefined                    |
| managePackageManagerVersions | undefined                    |
| autoInstallPeers             | false                        |
| enableGlobalVirtualStore     | false                        |

Executing installed pnpm 12.4.2 after the change returned
`ERR_PNPM_BAD_PM_VERSION`, without switching/downloading. Registry unchanged;
no minimum-release-age exception, override or audit ignore was added. Previously
ignored engine strictness was not newly enforced. Node/typings versions unchanged.

## Supply-chain remediation: BLOCKED

`pnpm audit --json` failed with `ERR_PNPM_AUDIT_BAD_RESPONSE`, registry endpoint
`npm.flatt.tech/-/npm/v1/security/advisories/bulk`, DNS/connect error. A final
`timeout 25s pnpm audit --json` exited 124 without producing a report. These are
not successful audits. The existing CI investigation reports 10 advisories
(three low, five moderate, two high); that is historical CI evidence, not a fresh
count. Current package/lock and `pnpm why undici --json` confirm undici 7.29.0.

Known High advisories were checked against primary upstream publications:

| Advisory                                                                                        | Vulnerable 7.x range | Patched | Current dependency paths                                             | Scope                   |
| ----------------------------------------------------------------------------------------------- | -------------------- | ------- | -------------------------------------------------------------------- | ----------------------- |
| [GHSA-rfgv-xxqx-mfg5](https://github.com/nodejs/undici/security/advisories/GHSA-rfgv-xxqx-mfg5) | >=7.0.0 <7.29.1      | 7.29.1  | root -> miniflare -> undici; root -> wrangler -> miniflare -> undici | transitive, dev tooling |
| [GHSA-w293-vg96-wgc3](https://github.com/nodejs/undici/security/advisories/GHSA-w293-vg96-wgc3) | >=7.24.1 <7.29.1     | 7.29.1  | same paths                                                           | transitive, dev tooling |

Root has direct Miniflare 5.20260926.0-alpha and Wrangler 4.143.0. Both lead to
undici 7.29.0; these are not direct Worker runtime dependencies. This does not
waive the remediation requirement. Full current advisory enumeration could not
be obtained from the registry and is not claimed complete.

Compatible update attempts used pnpm only, not manual lock edits:

- `pnpm update wrangler --lockfile-only --store-dir /tmp/jump-03-store` exited 0,
  generating Wrangler 4.143.1 / its Miniflare 5.20260926.1-alpha / undici 7.29.1,
  but direct Miniflare still retained undici 7.29.0.
- `timeout 30s pnpm add -D miniflare@5.20260926.1-alpha --lockfile-only --store-dir /tmp/jump-03-store`
  exited 124 during supply-chain policy metadata verification.
- `timeout 25s pnpm update miniflare@5.20260926.1-alpha --lockfile-only --store-dir /tmp/jump-03-store`
  exited 124. With the existing project store, a later Miniflare update exited 0,
  but Wrangler still retained undici 7.29.0; subsequent complete update verification
  timed out. Candidate frozen offline installation failed missing registry metadata.
- An attempted `pnpm update ... --offline` was rejected by local help/parser
  (exit 2); update does not accept that install flag in this executable.

Incomplete candidates were removed by restoring only this task's dependency
updates from saved baseline bytes. No user dependency change was discarded.
Final lock SHA256: `a17073e37ea2a60f9068ac3b8e1623b79746646deddd17d76c50f79bdf2f9aac`,
identical to the initial dirty lock. No patched dependency fix is claimed.

Initial offline install attempts with empty/default stores failed with missing
metadata/tarballs; pnpm exec then attempted automatic dependency installation and
was interrupted on DNS errors. This temporarily made node_modules unavailable.
Recovery used ordinary `pnpm install --frozen-lockfile --offline --store-dir
/home/mslo/Projects/.pnpm-store`: exit 0, 118 packages reused, zero downloads,
normal cached supply-chain policy acceptance. No trust-lockfile override or
security-policy bypass was used. Installed versions are restored to the original
lock, not the abandoned patch candidates. Later task execution explicitly passed
that existing store to avoid unintended store migration/reinstallation.

## Validation commands and actual results

All task execution below used installed pnpm 12.0.0 and
`--store-dir /home/mslo/Projects/.pnpm-store`; knip used
`KNIP_DISABLE_RAW_TRANSFER=1`, matching CI. No remote CI rerun was performed.

| Command                                                                              | Exit | Result                                                                                                                    |
| ------------------------------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------- |
| pnpm run format:check                                                                | 0    | PASS, whole repository                                                                                                    |
| pnpm run lint:check                                                                  | 0    | PASS, type-aware                                                                                                          |
| pnpm run typecheck                                                                   | 0    | PASS after fixing a test-only possibly-undefined lookup                                                                   |
| pnpm run test                                                                        | 0    | PASS, 544 tests / 11 files                                                                                                |
| pnpm run test:cov                                                                    | 0    | PASS, 544 tests; statements 99.91% (1143/1144), branches 99.88% (883/884), functions 100% (197/197), lines 100% (986/986) |
| pnpm exec knip --include unlisted,unresolved,binaries                                | 0    | PASS, CI scope                                                                                                            |
| pnpm exec knip                                                                       | 0    | PASS; informational redundant-entry hint only                                                                             |
| pnpm peers check                                                                     | 0    | PASS, no peer dependency issues                                                                                           |
| pnpm run test:worker                                                                 | 1    | BLOCKED_ENVIRONMENT, listen EPERM 127.0.0.1; no workerd cases passed                                                      |
| pnpm run test:e2e                                                                    | 1    | BLOCKED_ENVIRONMENT, web server listen EPERM 127.0.0.1:4173; no browser assertions ran                                    |
| pnpm run cloudflare:check --env-file /tmp/jump-03-empty.env                          | 0    | PASS, Wrangler 4.143.0 dry-run; 284.87 KiB upload estimate / 68.94 KiB gzip, no upload                                    |
| git diff --check                                                                     | 0    | PASS                                                                                                                      |
| pnpm config get (keys above)                                                         | 0    | PASS, effective outputs recorded                                                                                          |
| pnpm audit --json                                                                    | 1    | BLOCKED, registry DNS/connect failure                                                                                     |
| timeout 25s pnpm audit --json                                                        | 124  | BLOCKED, no final report                                                                                                  |
| pnpm install --frozen-lockfile --offline --store-dir /home/mslo/Projects/.pnpm-store | 0    | PASS original locked installation from existing store; cached policy acceptance only                                      |

Dry-run used an empty env file, isolated XDG config, metrics disabled and unset
Cloudflare/CF credential variables. It is local bundle/schema validation only.
No secret-scan binary/action or live production inspection was executed here;
remote required checks are not inferred from local results. Existing 99% coverage
thresholds and user exclusion annotations were preserved, not weakened.

## Adversarial review

Reviewed the changes independently after implementation: no broad override or
release-age bypass; registry unchanged; pnpm settings effective; invocation logs/
traces enabled and persisted with query redaction; no added raw application log
values; structural TTL constant enforced after signature with no skew addition;
WHATWG receiver contract not weakened; 13/20 graph and production external=false
unchanged; explicit non-extractable pair-probed key model unchanged; historical
records and external rollback/GitHub blockers retained. Existing cache/retry design
and accepted limiter semantics were not altered.

No new Critical/High/Medium application implementation finding was found in this
bounded local review. Known High supply-chain advisories remain, and fresh audit
is incomplete, so `NO_KNOWN_MEDIUM_OR_HIGH_LOCAL_FINDINGS` is NOT asserted.
Low deferred items: signer failure caching, malformed-JWKS negative caching and
broad retry redesign. Informational/accepted scope boundaries: Node/typings,
prerelease Miniflare, external archives and native pathname/metadata exposure.
Review is not production penetration testing or external receiver acceptance.

Key lifecycle runbook consistency confirmed: active private/kid each one; explicit
public verification set may include active/grace/future keys; generator output is
merged; prepublish B, activate B retaining A public, measured retirement; recovery
keeps B; old private disposal requires verified B deployment/receiver/recovery;
compromise skips grace and requires receiver revocation. JWKS removal alone does
not complete emergency revocation. No rotation was performed.

## Final state and disposition

LOCAL_IMPLEMENTATION_STATUS = PARTIAL_AUDIT_REMEDIATION_BLOCKED.
LOCAL_SECURITY_REVIEW_STATUS = BLOCKED_BY_KNOWN_SUPPLY_CHAIN_FINDINGS.
VALIDATION_STATUS = PARTIAL_BLOCKED_ENVIRONMENT_AND_AUDIT.
ROLLOUT_STATUS = BLOCKED_FOR_ROLLOUT.

F01-F21 ownership and disposition are in the [current plan](../plans/jump-0.3-hardening.md).
GitHub enforcement, real immutable recovery artifact, reported Rails Rack URL
comparison mismatch, receiver outbound TTL acceptance and production bindings/
traffic remain unverified external release gates. No blocker was silently cleared.

Final dirty-file inventory: existing means initial user changes; 0.3 means this
run added changes. All staged state remains unchanged (empty).

| File                                          | Ownership      |
| --------------------------------------------- | -------------- |
| `.npmrc`                                      | 0.3            |
| `README.md`                                   | 0.3            |
| `adr/0006-jump-0.3-hardening.md`              | 0.3            |
| `docs/architecture.md`                        | 0.3            |
| `docs/compatibility.md`                       | 0.3            |
| `docs/decisions.md`                           | 0.3            |
| `docs/logging.md`                             | existing + 0.3 |
| `docs/operations/production-configuration.md` | existing + 0.3 |
| `docs/operations/rollback-recovery.md`        | 0.3            |
| `docs/operations/schema-migration.md`         | 0.3            |
| `docs/privacy.md`                             | existing + 0.3 |
| `docs/protocol.md`                            | 0.3            |
| `docs/receiver-contract.md`                   | 0.3            |
| `docs/security.md`                            | 0.3            |
| `docs/supply-chain.md`                        | 0.3            |
| `evidence/2026-10-03-jump-0-3-hardening.md`   | 0.3            |
| `evidence/2026-10-03-vitest-coverage.md`      | existing only  |
| `package.json`                                | existing only  |
| `plans/jump-0.3-hardening.md`                 | 0.3            |
| `pnpm-lock.yaml`                              | existing only  |
| `pnpm-workspace.yaml`                         | existing + 0.3 |
| `scripts/test-worker.mjs`                     | 0.3            |
| `src/cloudflare.ts`                           | existing only  |
| `src/config/registry.umaxica.ts`              | existing + 0.3 |
| `src/core/fetch_jwks.ts`                      | existing only  |
| `src/core/handle_jump.ts`                     | existing only  |
| `src/core/jwks_cache.ts`                      | existing only  |
| `src/core/normalize_url.ts`                   | existing + 0.3 |
| `src/core/public_error.ts`                    | 0.3            |
| `src/core/types.ts`                           | 0.3            |
| `src/core/verify_jwt.ts`                      | existing + 0.3 |
| `src/index.ts`                                | existing only  |
| `test/cloudflare-edges.test.ts`               | existing only  |
| `test/core-edges.test.ts`                     | existing + 0.3 |
| `test/fixtures/receiver-contract.json`        | 0.3            |
| `test/jump.test.ts`                           | existing + 0.3 |
| `test/production-contract.test.ts`            | 0.3            |
| `test/receiver-url-contract.test.ts`          | 0.3            |
| `test/security-hardening.test.ts`             | 0.3            |
| `test/signing-material.test.ts`               | 0.3            |
| `test/token-boundaries.test.ts`               | 0.3            |
| `vitest.config.ts`                            | existing only  |
| `wrangler.jsonc`                              | existing + 0.3 |
