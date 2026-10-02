# Jump 0.3 current hardening status

Status snapshot: 2026-10-03. Local follow-up is based on `develop`
`1c946814e5ca78a8d69b48a3029e26da36c29b22`, plus the uncommitted follow-up changes.
GitHub main `7ec79fe6c77af2c253e4ecfc3cc87c3231e4e30d` has the same baseline
tree (`4c38264df19ab42561fd91555f36e598648b67a8`). CI results below belong to
that main SHA, not to the uncommitted follow-up or a deployed production state.
[0.2 plan](jump-0.2-security.md) and earlier plans are frozen historical records;
their old SHA, counts and CI statements are not current verification.

## Implementation and contract

Service 0.3.0, JWT schema 1, exact reuse, ES384/P-384, required configured origin,
13/20 graph and production external=false remain fixed. Inbound structural TTL
is tightened to 30 seconds, without adding skew. Outbound stays 30 seconds.
Normal key prepublish/activate/retire, explicit public bundle, non-extractable
private import, active pair probe, B recovery and receiver compromise revocation
are unchanged. See [ADR 0006](../adr/0006-jump-0.3-hardening.md).

pnpm 12 effective configuration, persisted native observability/query redaction,
privacy/OAuth distinctions, native-only retention, registry trust documentation,
unused exports and targeted boundary regression tests are implemented. No new
cache design, graph expansion, replay state, receiver emulator or provider is added.
`render_error.ts` and `renderUnavailablePage` are retained because the existing
user-added test utility suite actually consumes them. The unused production
exports nodes/edges/isForbiddenHost/PublicErrorCode were made module-local.

## Validation by revision and environment

[Main CI run 37034283355](https://github.com/seahal/umaxica-apps-edge-jump/actions/runs/37034283355)
passed quality, unit/coverage, worker-runtime, e2e, secret-scan,
cloudflare-dry-run and dependencies on the main SHA above. Frozen installation
passed in CI. The read-only review observed 544 tests in 11 files, 20 signed
workerd edges and 16 browser cases. Coverage was 99.91% statements, 99.88%
branches and 100% functions/lines, with the configured exclusions.
`CI_OTHER_THAN_AUDIT = GREEN` for that SHA. Audit advisories were outside this
follow-up's scope; no fresh local audit was run or advisory inventory inferred.

Workers Builds also passed for that SHA, reporting Worker version
`0fc30707-2f24-4eef-94e1-21d444a3f65a`. This proves a build result, not production
traffic assignment, binding verification or tested recovery.

Earlier local install/DNS and workerd/browser EPERM results remain accurate
historical evidence in the [hardening](../evidence/2026-10-03-jump-0-3-hardening.md)
and [closure](../evidence/2026-10-03-jump-0-3-closure.md) records. They do not negate
the later main CI passes. The new local follow-up strengthens negative-cache
eviction/expiry assertions and signed array-audience rejection tests, and removes
the incorrect coverage exclusion on the exact string audience guard. Runtime
acceptance, cache policy, dependencies and observability policy are unchanged.
Its own validation is recorded in the
[follow-up evidence](../evidence/2026-10-03-jump-local-review-followup.md);
baseline CI must not be reused as proof that these new tests passed.

Pre-deployment acceptance is `USER_REPORTED_COMPLETE`, accepted as the user's
premise and not rerun. Its tested revision and detailed cases were not supplied
here. The separately identified Rails URL/TTL contract gaps and rollback artifact
gate are not closed by that general report. See the
[Rails handoff](../docs/operations/rails-receiver-followup.md) and
[release closure](../docs/operations/release-closure.md).

## Findings disposition

IDs are assigned in this 0.3 record; A/B/C refer to the requested ownership groups.

| ID  | Group | Disposition      | Finding and result                                                                                    |
| --- | ----- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| F01 | A     | FIXED            | pnpm 12 settings verified; no auto-switch/download or new engine enforcement                          |
| F02 | A     | BASELINE_CI_PASS | Frozen install and dependencies job pass on recorded main SHA; advisory audit excluded from follow-up |
| F03 | A     | FIXED            | Native invocation logs/traces ON, persistence/sampling/redaction frozen                               |
| F04 | A     | FIXED            | 0.3 current record and compatibility replace historical current-status links                          |
| F05 | A     | FIXED            | URL-visible short-lived OAuth values distinguished from forbidden credentials                         |
| F06 | A     | FIXED            | Native retention only; no implemented 30-day archive claim                                            |
| F07 | A     | FIXED            | Registry purpose/trust/outage/integrity documented                                                    |
| F08 | A     | FIXED            | Actual unused exports removed; consumed test utilities retained                                       |
| F09 | A     | FIXED            | Reuse NUL, registered kid 127/128, prelookup 129, URL/TTL/config boundaries                           |
| F10 | A     | FIXED            | Inbound maximum 30 seconds, fractional/time boundaries preserved                                      |
| F11 | A     | FIXED            | 0.3.0 runtime/health/fixture/docs inventory synchronized; package already 0.3.0                       |
| F12 | B     | EXTERNAL_BLOCKER | Reported Rails Rack URL comparison differs from normative WHATWG semantics                            |
| F13 | B     | EXTERNAL_BLOCKER | main protected=false; ruleset 16901037 disabled, verified read-only; no remote change                 |
| F14 | B     | EXTERNAL_BLOCKER | Real rollback-compatible immutable Worker version not verified                                        |
| F15 | B     | EXTERNAL_BLOCKER | Rails must accept outbound structural TTL of 30 seconds                                               |
| F16 | C     | DEFERRED         | Signing-material failure cache unchanged                                                              |
| F17 | C     | DEFERRED         | Malformed JWKS negative cache and broad retry policy unchanged                                        |
| F18 | C     | DEFERRED         | Node 24 / typings 26 mismatch excluded; versions unchanged                                            |
| F19 | C     | DEFERRED         | External log export/archive and extended retention not implemented                                    |
| F20 | C     | ACCEPTED_RISK    | Native platform pathname/generated metadata persistence                                               |
| F21 | C     | ACCEPTED_RISK    | Prerelease Miniflare itself retained; separate undici advisory is F02                                 |

## Release gates

`LOCAL_IMPLEMENTATION_STATUS = FOLLOWUP_IMPLEMENTED_VALIDATION_ENVIRONMENT_BLOCKED`.
`BASELINE_CI_STATUS = GREEN_AT_RECORDED_MAIN_SHA`.
`WORKER_RUNTIME_STATUS = BASELINE_CI_PASS`.
`E2E_STATUS = BASELINE_CI_PASS`.
`PRE_DEPLOYMENT_ACCEPTANCE = USER_REPORTED_COMPLETE`.
`EXTERNAL_RELEASE_GATE_STATUS = BLOCKED`.
`FOLLOWUP_VALIDATION_STATUS = BLOCKED_LOCAL_DEPENDENCY_ACCESS`.
`GITHUB_RELEASE_GATE = BLOCKED_UNTIL_ENFORCED`.
`ROLLBACK_ARTIFACT = NOT_VERIFIED`.
`ROLLOUT_STATUS = BLOCKED_FOR_ROLLOUT`.

GitHub administrator must enforce quality, unit/coverage, worker-runtime, e2e,
secret-scan and cloudflare-dry-run. Dependency audit must pass as well. Source
workflow presence is not enforcement. Specific Rails URL and TTL contract closure,
production bindings/traffic and a real recovery artifact remain external tasks.
No Rails changes, deploy, secret/DNS/settings changes, commit or push occurred.
