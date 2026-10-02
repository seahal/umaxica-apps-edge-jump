# Jump 0.3 closure pass evidence

Date: 2026-10-03 Asia/Tokyo. Branch feature, HEAD
970477e28ac170563bdad7a03800a66c64eb271f. No staged changes at start.
35 tracked unstaged modifications and 8 untracked files at start. Baseline status,
staged/unstaged patches and 139 file SHA-256 values saved in
`/tmp/jump-closure-baseline/`; baseline hash manifest SHA-256: 07abbf1b3d2d8bcd9bd1e88d682ab744296b7442abbb281aec169d3f9be5edbe.
Read package.json, lock/workspace/.npmrc, Miniflare/workerd harness, integration
workflow, 0.3 plan/evidence, key rotation, rollback and normative receiver contract.
No Rails changes, remote mutations, deploy, secrets/DNS/settings changes,
commit/push or destructive Git operations occurred.

## Supply chain

Before: undici 7.29.0. Lock after: undici 7.29.1; no resolved 7.29.0 snapshot/dependency (selector alone remains).
Installed after: still 7.29.0; patched installation is NOT verified.
Paths: root -> miniflare@5.20260926.0-alpha -> undici; root -> wrangler@4.143.0
-> same Miniflare -> undici. Wrangler pins Miniflare exactly; Miniflare pins
Undici exactly 7.29.0. 7.29.1 is same-minor patch compatible by release semantics,
but does NOT satisfy the original exact constraint. Override intentionally
replaces only that vulnerable version; runtime compatibility remains a CI gate.

Verified pnpm 12.0.0 `config get overrides` accepts
`undici@7.29.0: 7.29.1`. Official [selector documentation](https://github.com/pnpm/pnpm.io/blob/main/versioned_docs/version-10.x/settings.md)
supports version-limited overrides. The only lock diff against baseline is that
override and the Undici package integrity/snapshot/dependency replacement.
`pnpm install --lockfile-only --prefer-offline` generated resolution from cached
mirror metadata; the command later stalled in policy verification and was
interrupted. A subsequent `pnpm install --lockfile-only --offline` independently
resolved the same patch then failed full metadata policy checks. Generated lock
is retained; no manual lock/integrity/tarball fabrication or policy bypass.

Known High advisories:
[GHSA-rfgv-xxqx-mfg5](https://github.com/nodejs/undici/security/advisories/GHSA-rfgv-xxqx-mfg5)
(WebSocket DoS) and
[GHSA-w293-vg96-wgc3](https://github.com/nodejs/undici/security/advisories/GHSA-w293-vg96-wgc3)
(BalancedPool TLS verification bypass), upstream patched 7.29.1 verified live.
minimumReleaseAge=4320 unchanged; no exception needed/added. Registry remains
https://npm.flatt.tech/. No audit ignores. Remove override when both upstream
paths naturally resolve patched versions and fresh audit/runtime checks pass.

Patched frozen offline install failed ERR_PNPM_NO_OFFLINE_META for full
@cloudflare/workers-types metadata; frozen online install attempted the actual
mirror Undici 7.29.1 tarball and encountered DNS/connect failure (30s timeout).
Patched tarball absent from available store; no installed-tree remediation claim.
Before/after 25s bounded audit attempts timed out without a report. Historical CI
had two High, five Moderate and three Low; those counts are not a fresh audit.

KNOWN_UNDICI_HIGH_FINDINGS = REMEDIATED_IN_LOCK.
FRESH_REGISTRY_AUDIT = BLOCKED_ENVIRONMENT.
SUPPLY_CHAIN_PATCH_PREPARED; REGISTRY_MIRROR_BLOCKED.
Installed tooling still carries the known two High findings; remaining Medium
inventory is unknown without fresh audit. Exact closure procedure is in
[release closure](../docs/operations/release-closure.md).

## Runtime investigation

Old and new transport: Miniflare dispatchFetch -> Undici Pool -> internal HTTP
entry socket -> workerd@1.20260926.1 -> real Worker fetch. Installed Miniflare
5.20260926.0-alpha source has unconditional #getLoopbackPort at startup,
#startLoopbackServer with HTTP/2 server.listen(0, hostname), and dispatchFetch
awaiting ready then forwarding to #runtimeEntryURL. Source inspected at
node_modules/miniflare/dist/src/index.js (startup around 124368, loopback around
123900, dispatch around 124723). Public types/source show no supported socket-free
path. [Upstream API](https://developers.cloudflare.com/workers/testing/miniflare/core/fetch/)
describes dispatchFetch, but it does not imply socket-free execution.

No new application listener, Node-only fake, security workaround or production
secret use. Harness retains generated nonproduction keys, pinned JWKS responses,
20 signed transitions, wrong-path rt, origin mismatch, missing/denying/throwing
limiter, pair mismatch, JWKS, deadline and response contracts. Added GET/HEAD
health /health with JSON negotiation, explicit invalid rt and query-redaction
config assertion. These added runtime cases have NOT passed: startup listen EPERM
127.0.0.1 precedes Worker assertions. E2E failed webServer listen EPERM at 4173;
no browser assertions executed. Both are CI_REQUIRED_GATE, not application bugs.

## Validation

pnpm 12.0.0 used explicitly; default PATH selects mismatched 12.4.2.
Node was 24.21.0; Node/@types versions/configuration were not changed.
All task calls used --store-dir /home/mslo/Projects/.pnpm-store. Because pnpm run
attempts patched installation automatically, validation temporarily restored
only this pass's dependency changes to saved initial bytes. Ordinary original
frozen offline installation succeeded (exit 0). Patched lock/workspace are restored
in final tree. Results below validate final application/source/harness changes
using ORIGINAL installed dependencies, not patched tooling. Patched unit/coverage/
workerd/dry-run repetition remains required after successful frozen installation.

| Check        | Exit |
| ------------ | ---- |
| format-check | 0    |
| lint-check   | 0    |
| typecheck    | 0    |
| test         | 0    |
| coverage     | 0    |
| knip-ci      | 0    |
| knip-full    | 0    |
| peers        | 0    |
| worker       | 1    |
| e2e          | 1    |
| dry-run      | 0    |

Commands: pnpm run format (write), format:check, lint:check, typecheck, test,
test:cov, test:worker, test:e2e, cloudflare:check; pnpm exec knip
--include unlisted,unresolved,binaries; pnpm exec knip; pnpm peers check.
Both knip passes repeated with KNIP_DISABLE_RAW_TRANSFER=1 as CI; only redundant
entry informational hint. Unit/coverage: 544 tests, 11 files. Coverage statements
99.91% (1143/1144), branches 99.88% (883/884), functions 100% (197/197), lines 100%
(986/986), unchanged 99% thresholds. Dry-run 284.87 KiB / gzip 68.94 KiB,
no upload; empty env-file, isolated XDG config, metrics disabled, CF/Cloudflare
credential env removed. Local bundle check is not deployed runtime proof.

## Final adversarial review

Dependency review separately checked generated lock diff, both paths, exact
vulnerable selector, no future-major selection, no age exception/audit ignore,
and unchanged registry. Installed vulnerable tree and incomplete fresh audit are
explicitly retained blockers, not silently waived. No runtime PASS is claimed.

Application review reread limiter exception boundary, private key import/pair
probe, claim TTL validation, redirect handler/URL binding, registry and logging
paths after edits. All production source and protocol fixtures remain byte-identical
to this pass's baseline. Schema 1/reuse/13 nodes/20 edges/30s TTL, capability with
production external=false, configured origin/JWKS, non-extractable private import,
stateless design and security headers are preserved. No runtime derivation fallback,
extra active private signer, raw RT/JWT application logs or external archive added.
Observability configuration remains byte-identical: invocation logs/traces enabled,
persisted, sampling 100%, query redaction true. Limiter fail-open not expanded.

Critical application: none found. High application: none found. Medium application:
none found in bounded static/unit review. This is not live penetration testing.
Dependency High: two known remediated in lock, still in installed tooling.
Dependency Medium: fresh enumeration blocked; historical five Moderate not cleared.
Low deferred application work: failure cache / malformed-JWKS negative cache,
unchanged and outside scope. Informational: socket restriction, native platform
metadata exposure, prerelease Miniflare, no external archive; Node/typings outside scope.

## Key rotation and external release gates

Key rotation runbook reviewed, unchanged. SHA-256 d92a16dffd2830fa9e73234b9197a47346a3d3891ba7442377a40b693f532e10.
Confirmed public verification set, generator merge input, one active private,
prepublish B -> activate B -> measured public A grace -> remove A public;
A private disposal after separately tested B/receiver/recovery conditions,
no private retention needed for grace, compromise skips grace with receiver revoke
first/parallel, public JWK removal alone != revoke, B-compatible rollback.
Existing rollback runbook remains unchanged; 0.3 exact artifact checklist added
only in the closure packet. No rotation performed.

GitHub enforcement, actual immutable B-compatible recovery artifact, actual
production binding inventory, Rails URL contract and Rails outbound 30s TTL
acceptance remain OPEN. Owners, steps and exact CLOSED conditions are in the
[closure packet](../docs/operations/release-closure.md). Remote settings and Rails
were not inspected/mutated; local fixture success does not close receiver gates.

LOCAL_IMPLEMENTATION_STATUS = COMPLETE (repository preparation complete).
LOCAL_SECURITY_REVIEW_STATUS = NO_KNOWN_MEDIUM_OR_HIGH_APPLICATION_FINDINGS.
DEPENDENCY_REMEDIATION_STATUS = REMEDIATED_IN_LOCK_INSTALL_AND_AUDIT_BLOCKED.
WORKER_RUNTIME_STATUS = BLOCKED_ENVIRONMENT_CI_REQUIRED_GATE.
E2E_STATUS = BLOCKED_ENVIRONMENT_CI_REQUIRED_GATE.
EXTERNAL_RELEASE_GATE_STATUS = BLOCKED.
ROLLOUT_STATUS = BLOCKED_FOR_ROLLOUT.

## Initial dirty-file hashes

These are initial SHA-256 values, not HEAD hashes. Final preservation comparison
is recorded below. Full baseline manifest stays in /tmp, not as a large repository
artifact. Historical evidence remains unchanged.

| Initial user-owned file                       | SHA-256                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `.npmrc`                                      | `ea1d7db09e78c4350df4292917efe8680331c4b60cd85e2dc93d2ea0b83fa93b` |
| `README.md`                                   | `812c94cda38ffe91b0ac1c6f0cf46fefd99726fc0998f02239c0a71e2e604393` |
| `docs/architecture.md`                        | `e9e91b84482be7f15efaf186de876247dd1c61af9f824f8b08c5bacadea3d658` |
| `docs/compatibility.md`                       | `71c216677b2f402c1b8dd4694fdc9875a09ad419ff426b3514a7d00484f83739` |
| `docs/decisions.md`                           | `0fbe142a942973f7c25075e27b6c0af173c0f362ae8482b2ae16141de6c1aaaf` |
| `docs/logging.md`                             | `0e635fcc8cf1204e884b393cf416d16b5ba18799e2ebd99e5622eb4083245bb1` |
| `docs/operations/production-configuration.md` | `403f4d393fcb7b0c13637aab349f7fb3021df513975fa37b9c134a9cb5fb39a1` |
| `docs/operations/rollback-recovery.md`        | `240afda34963c9658c5ec7668afd52760c503ca58c04204092f5e9d6c4f1099c` |
| `docs/operations/schema-migration.md`         | `d2507f30eeebdd8fcb3d4696a81841f1b0b024c80117e826344d72711de8b21a` |
| `docs/privacy.md`                             | `ff2caba4557a6039d4e3d02e61aa0dd6b81a991d0694fd75182fa618efff34a9` |
| `docs/protocol.md`                            | `4b2fbf1af85b2a77d5ca313334cb0c6da6a77b28e6a004348695411853caab50` |
| `docs/receiver-contract.md`                   | `4e92f48311e187468e6245ee1a57c0cf26d93f643a51fcd269be0db716df2792` |
| `docs/security.md`                            | `5e2dfa5d7c4667e80ab92905c6e07cbec55422894bc6eba1aa6f83118369244c` |
| `package.json`                                | `93336dc6a33c47c6a370a2f60351d8eace9515c765af4762c6020bfec7d58596` |
| `pnpm-lock.yaml`                              | `a17073e37ea2a60f9068ac3b8e1623b79746646deddd17d76c50f79bdf2f9aac` |
| `pnpm-workspace.yaml`                         | `fb2441aac1bc122788d40ed07769d576eb6eef7035c2bf764a9c7c200f955133` |
| `scripts/test-worker.mjs`                     | `31eb67c5a5cca67f02af0c568803d29355bbabf1f02165e46c49e9569cd95702` |
| `src/cloudflare.ts`                           | `d465bd839f0573e135f55ff361dd2cef559f937f751953cfbf2ef54c047eb070` |
| `src/config/registry.umaxica.ts`              | `6656df4ba67ba3df3e386359a8d27dbe6d9f85b53c5c58581e0d6c6f395b9341` |
| `src/core/fetch_jwks.ts`                      | `ba0047256b527bbc0743ee05d9bb4e6279b9458c22ec18de6bfcbf6c66046aca` |
| `src/core/handle_jump.ts`                     | `306d1249ddf56a2f597c053e1fa6528a37f0eaae8ad850841eb08568c8458b18` |
| `src/core/jwks_cache.ts`                      | `8301ee3898e9b76b935f9768e62225ce14726ce7155b791ff4d706c9f95b4462` |
| `src/core/normalize_url.ts`                   | `dc27e202e5940257b4ae8cedfa7c4324016105abfbc5a5cb26b70d17dbc7fc66` |
| `src/core/public_error.ts`                    | `cf3c8ed13c007d20a74c87c7a5990c902e472976403520bc31032897c8fc894a` |
| `src/core/types.ts`                           | `39db230683192888d0a905ff5cee27d1ea3fba0c160702982399f24523ab4a42` |
| `src/core/verify_jwt.ts`                      | `b7e754dbfd05e2dd9574efb2927004fd43ff6abeb0a4bc382d7a13af69d9ba31` |
| `src/index.ts`                                | `5e802801d90c028a7ff0725ed2ccd86ea7e54352b385401cdcb7113f1f9ca41e` |
| `test/fixtures/receiver-contract.json`        | `7f884dcc348ff61cd94643b4dfbc0c5e27caa21fbf570abed81084b59471339e` |
| `test/jump.test.ts`                           | `95183c8be108097dfee0be00681bbc01301905266e1a17df597a7c0cb723c29a` |
| `test/production-contract.test.ts`            | `90e6bbea300c505207b9c52f89dc2e94c5521f6efd425b393fcc6256cc1da64a` |
| `test/security-hardening.test.ts`             | `2c4c5b490dee5b1436c4d0b989ffc5889245af35b9a34980a766dcd89d568ce1` |
| `test/signing-material.test.ts`               | `7c5f8766cadb7d2024187e8d6501730534d203b1f13d8ad138030e4a1d832d2b` |
| `test/token-boundaries.test.ts`               | `4d50254b3e1f03a695d0507ec5041f3129ae7b52ced7baef2be4eee053da20ad` |
| `vitest.config.ts`                            | `9067f4880b6f8817da89fa5d4413ae423373f68c8528a11eee716f355ec44963` |
| `wrangler.jsonc`                              | `df8e248f8bcaa8e02471a22c57accb5bcb688e4175295b68692896585405cb87` |
| `adr/0006-jump-0.3-hardening.md`              | `332400a1b07833c7322f5882235be87c7f020217c222a84a60fcab1f73135a2f` |
| `docs/supply-chain.md`                        | `d958ed9af9776fda526bd596fa2cc32e7c734eb0bb9d410aa3ecd165e51ca0dd` |
| `evidence/2026-10-03-jump-0-3-hardening.md`   | `7a9a2be9cab71216f7dda4086d6219da32c4896cd727ea2f2edcc6574da2700f` |
| `evidence/2026-10-03-vitest-coverage.md`      | `bd83926492bbd6ebb0b0a651685edecdbc30f66edf4a044192a50792347f2525` |
| `plans/jump-0.3-hardening.md`                 | `40cca407e225fd78d9f3d5831c04bf8fd2881f2fb559d098b1cdc2889a635cbe` |
| `test/cloudflare-edges.test.ts`               | `5136c40b46a14b86614df7fb319a08c253782c9baed1ae31db3199c83a473d08` |
| `test/core-edges.test.ts`                     | `917f497c32ee8687afcf90dff5f392fab29749e8fa1d79f752a2fa7d2a7e99a3` |
| `test/receiver-url-contract.test.ts`          | `b77f3c3b6a40f7063a59aa0fd6ef54c60ec3d6ed3a3badaf542f403dcf035af4` |

## Final preservation comparison

134 / 139 initial files are byte-identical. All application source, existing
tests/fixtures, package.json, .npmrc, workflows, wrangler.jsonc, coverage config,
key-rotation/rollback/receiver docs and prior evidence are unchanged. Staged
patch remains identical (empty). Only five existing files were deliberately
extended by this pass; no initial change was discarded.

| Existing file changed by closure | Initial SHA-256                                                    | Final SHA-256                                                      |
| -------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `docs/supply-chain.md`           | `d958ed9af9776fda526bd596fa2cc32e7c734eb0bb9d410aa3ecd165e51ca0dd` | `a4f991e052ac88833331d2c772f56374852993149bdd0119b13a920c06d5ccc8` |
| `plans/jump-0.3-hardening.md`    | `40cca407e225fd78d9f3d5831c04bf8fd2881f2fb559d098b1cdc2889a635cbe` | `9090fc5bd383d1d7db5bf9bba3b14fbaf04b6ee2cba5d8869e93716417d67327` |
| `pnpm-lock.yaml`                 | `a17073e37ea2a60f9068ac3b8e1623b79746646deddd17d76c50f79bdf2f9aac` | `5a217c39a0869e98152b224a69abd2440e344078b50f130a97782b30b8549558` |
| `pnpm-workspace.yaml`            | `fb2441aac1bc122788d40ed07769d576eb6eef7035c2bf764a9c7c200f955133` | `fee4ae8f36d1fd577668b6921f57aadfd9d4c8d234cc6162d80d233a8887c3eb` |
| `scripts/test-worker.mjs`        | `31eb67c5a5cca67f02af0c568803d29355bbabf1f02165e46c49e9569cd95702` | `b5d5c8df3de84c8b4aaa194ef44c93da1941db48b751425c8a6fdb11a7c02928` |

New files: docs/operations/release-closure.md and this evidence record.

Final git diff --check: PASS (exit 0).
