# Additional hardening baseline and review

Branch: develop. HEAD: 5c82d5b3883840637481d13babfe5902db02f99a. Service: 0.2.0. JWT schema: 1.

Initial working tree (all preserved as the implementation baseline):

```text
 D .vite-hooks/pre-commit
 M README.md
 M SECURITY.md
 M adr/0001-no-static-asset-serving.md
 M adr/0004-multiple-jump-implementations.md
 M docs/architecture.md
 M docs/compatibility.md
 M docs/decisions.md
 M docs/faq.md
 M docs/glossary.md
 M docs/implementations.md
 M docs/logging.md
 M docs/operations/key-rotation.md
 M docs/operations/production-configuration.md
 M docs/operations/schema-migration.md
 M docs/security.md
 M docs/threat-model.md
 M e2e/server.ts
 M e2e/smoke.spec.ts
 D fastly.toml
 M knip.json
 M package.json
 M playwright.config.ts
 M pnpm-lock.yaml
 M pnpm-workspace.yaml
 M src/cloudflare.ts
 D src/config/jwks.example.json
 D src/config/registry.example.ts
 M src/config/registry.umaxica.ts
 M src/core/fetch_jwks.ts
 M src/core/handle_jump.ts
 M src/core/jump_jwks.ts
 M src/core/jwks_cache.ts
 M src/core/normalize_url.ts
 M src/core/page.tsx
 M src/core/policy.ts
 M src/core/render_about.ts
 M src/core/types.ts
 M src/core/verify_jwt.ts
 D src/fastly.ts
 M src/index.ts
 M test-results/.last-run.json
 M test/cloudflare-key-material.test.ts
 M test/jump.test.ts
 M test/security-hardening.test.ts
 M wrangler.jsonc
?? adr/0005-production-jump-0.2.md
?? docs/protocol.md
?? docs/receiver-contract.md
?? evidence/2026-10-02-ci-dependency-audit-investigation.md
?? evidence/2026-10-02-dependency-update-attempt.md
?? evidence/2026-10-02-jump-0-2-security.md
?? plans/jump-0.2-security.md
?? scripts/test-worker.mjs
?? src/core/deadline.ts
?? test/app-fixture.ts
?? test/failure-concurrency.test.ts
?? test/fixtures/
?? test/production-contract.test.ts
?? test/token-boundaries.test.ts
```

Scripts: format, format:check, keys:generate, cloudflare:check, cloudflare:dev, lint, lint:check, typecheck, test, test:cov, test:e2e, test:worker. Runtime harness: scripts/test-worker.mjs, esbuild + Miniflare/workerd with dispatchFetch and pinned issuer JWKS interception. Existing CI: quality, unit coverage, browser e2e, dependency audit, secret scan, Cloudflare dry-run; no runtime gate initially. Harness instructions: AGENTS.md, CLAUDE.md import shim, pnpm scripts, vitest.config.ts, playwright.config.ts, tsconfig.json, wrangler.jsonc, .github/actions/pnpm-project/action.yml (frozen install).

Preimplementation adversarial review: origin is required with no fallback; inbound aud, outbound iss, self-link, discovery and app identity cache consume configured origin. Adapter rejects mismatched request origins. Key bundle cache is env/revision/kid scoped; explicit JWKS and nonextractable private import with cryptographic probe are already required. Health proves responsiveness, not signer readiness. Existing runtime harness checks signed graph edges and wrong-path rt, but lacks CI gate and readiness cases. Recovery must not return to pre-0.2 output without reuse; old graphs, lost public-key overlap and identity changes can reject newly issued or unexpired tokens. No immutable compatible recovery artifact or production state is verified.

## Implemented changes and runtime gate

Cloudflare adapter GET/HEAD /ready uses required origin + request match, structural
limiter presence and the existing validated key cache. It returns exact coarse
JSON with shared final security headers, no cookie, no-store and no signature.
Health paths and navigation limiter semantics are retained. Added focused
readiness/origin/rotation tests. Special-use identity validation now rejects
reserved address ranges, local/special DNS suffixes and malformed DNS labels;
configured .example fixtures remain explicitly supported.

Existing esbuild/Miniflare script bundles the real Cloudflare adapter into workerd,
with a harness-only wrapper for limiter false/exception/missing and late ASSETS
faults. Native Miniflare limiter is used for 20 signed graph transitions; fault
cases model unavailable provider behavior inside workerd. Node generates keys,
asserts responses and independently verifies signatures; it does not invoke the
adapter for runtime cases. cf:false prevents Miniflare CF metadata fetching.
CI worker-runtime is an independent non-optional job using the unchanged frozen
install action. External branch protection/release settings are NOT VERIFIED.

## Validation actually performed

Commands that ran successfully used the pre-existing pinned pnpm binary via
`PATH=/home/mslo/.local/share/mise/installs/pnpm/12.0.0:$PATH`. No trust-policy
configuration was weakened. Initial PATH pnpm commands failed later with
ERR_PNPM_PNPM_ENGINE_IDENTITY_UNVERIFIABLE (registry identity/DNS verification);
the installed 12.0.0 binary could execute the commands below before dependency
state disappeared.

| Command                                 | Observed result                                                   | Scope / limitation                                                                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm run test -- test/readiness.test.ts | 8 files / 436 tests passed                                        | This script invocation ran the whole unit suite at the earlier implementation stage.                                                                     |
| pnpm run typecheck                      | Passed after correcting exactOptionalPropertyTypes fixture errors | Before the final DNS-label/special-range and runtime-script additions.                                                                                   |
| pnpm run test:cov                       | 8 files / 449 tests passed                                        | Before those final additions. Statements 93.59%, branches 89.95%, functions 95.26%, lines 95.71%.                                                        |
| pnpm run lint:check                     | Exit 0 with warnings                                              | Before final additions; includes existing warnings and new fixture non-null assertion warnings.                                                          |
| pnpm run format:check                   | Exit 1                                                            | Only preserved pre-existing test-results/.last-run.json remained after successful targeted formatting; final additions have not been formatter-verified. |
| pnpm exec oxfmt <task files> --write    | Earlier targeted invocation succeeded on 5 task files             | Did not change the pre-existing test-results file.                                                                                                       |
| pnpm run test:worker                    | Exit 1, listen EPERM on 127.0.0.1                                 | BLOCKED_EPERRM (actual OS code EPERM); no runtime cases completed. No security workaround applied.                                                       |
| pnpm run cloudflare:check               | Exit 0; dry-run bundle 284.63 KiB / gzip 68.83 KiB                | EROFS warning writing user-config log directory. Compilation only; before final additions; no deployment or production key/binding proof.                |
| git diff --check                        | Passed after final edits                                          | Static whitespace check only.                                                                                                                            |

At the final targeted `pnpm exec oxfmt` attempt, pnpm automatically started an
install path and registry downloads instead of formatting. It was interrupted
(exit 130); registry downloads reported DNS failures. No explicit install/update
command was issued, but this automatic installation attempt DID occur and is
recorded rather than claimed absent. node_modules/.bin/oxfmt and .modules.yaml
were observed absent. No dependency recovery/retry or security-policy exception
was performed. Final typecheck/lint/format/unit/coverage/runtime revalidation is
BLOCKED_DEPENDENCIES; the earlier 449-test result is not a claim about final files.
Browser e2e and dependency audit were not run in this task.

## Final adversarial review

MEDIUM fixed: service-origin validation previously admitted special-use literal
addresses/local DNS suffixes and malformed DNS labels despite the configured
identity restriction. Added service-only denial and independent literal negative
tests; final DNS-label/additional special-range tests are not executed. IANA
[IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry/),
[IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry/) and
[domain](https://www.iana.org/assignments/special-use-domain-names/) registries
were reviewed for the additional restrictions. No DNS lookup is performed;
syntactic validation cannot prove domain ownership or public resolution.

No new unresolved HIGH/MEDIUM implementation finding identified by static review.
Alternate identity has no runtime default fallback. Readiness returns no probe
signature or key detail, uses successful and in-flight key caching, and performs
no navigation signing or remote verification. LOW residual: failed bundle loads
are evicted, so repeated probes of broken configuration can consume import/secret
backend work; bounded operational probing and incident investigation are required.
Readiness does not change limiter-call fail-open scope, navigation IP checks,
public error mapping or health semantics. Normal rotation retains active/grace/
future public keys; compromise never grants grace and requires receiver revoke.
Recovery retains B verification when returning to uncompromised A; pre-0.2 and
old graph artifacts are not arbitrary safe targets. Runtime harness executes
the bundled adapter in workerd, not the Node unit implementation, but remains
unexecuted locally. No new token/secret/JWKS-body/arbitrary-URL/raw-exception logs
were added. Existing external cushion capability and all-disabled production
policy, reuse output, 169 policy pairs and 20 directed edges are preserved.

## Workspace preservation and observed concurrent state

Initial HEAD was 5c82d5b3883840637481d13babfe5902db02f99a. During work the index
changed and HEAD became 2f1aeb434732eca11c978969052a634a79b46f5a, with a clean
working tree observed before the final edits. No staging, commit, reset, restore,
checkout, stash, rebase, push or deploy command was executed by this task. The
source of this concurrent Git mutation was not established; it was not reverted.
Initial baseline hashes confirm package.json, pnpm-lock.yaml, pnpm-workspace.yaml,
.npmrc, production registry, handle_jump, render_cushion, wrangler.jsonc and
test-results/.last-run.json remained byte-identical through this task. Rails and
production/DNS/WAF/secrets were not modified. Historical evidence was preserved.

## Status and remaining blockers

LOCAL_IMPLEMENTATION_STATUS = LOCAL_IMPLEMENTATION_COMPLETE
VALIDATION_STATUS = PARTIAL_FINAL_REVALIDATION_BLOCKED_DEPENDENCIES
ROLLOUT_STATUS = BLOCKED_FOR_ROLLOUT
rollback-compatible immutable artifact: NOT YET VERIFIED

Unverified: production bindings, private/public pair, active/grace JWKS, actual
workerd validation, receiver contract compatibility, immutable recovery artifact,
origin migration operational readiness and external release gate enforcement.
Local Git commit identity does not verify an immutable deployed recovery version.

## Exact task file manifest (relative to initial task baseline)

- .github/workflows/integration.yaml
- adr/0005-production-jump-0.2.md
- docs/architecture.md
- docs/compatibility.md
- docs/logging.md
- docs/operations/key-rotation.md
- docs/operations/origin-cutover.md
- docs/operations/production-configuration.md
- docs/operations/readiness.md
- docs/operations/rollback-recovery.md
- docs/receiver-contract.md
- docs/threat-model.md
- evidence/2026-10-02-additional-hardening.md
- plans/jump-0.2-security.md
- scripts/test-worker.mjs
- src/cloudflare.ts
- src/core/normalize_url.ts
- test/readiness.test.ts

Ignored validation outputs were regenerated in coverage/ and dist/cloudflare/;
no generated/raw reports were stored in evidence/.
