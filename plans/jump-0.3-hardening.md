# Jump 0.3 current hardening status

Current record: 2026-10-03, branch `feature`, HEAD
`970477e28ac170563bdad7a03800a66c64eb271f` plus uncommitted working-tree changes.
This record does not claim remote CI or deployed production status.
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

## Local validation and unresolved dependency work

The executed baseline had 515 passing tests. Targeted RED added six failing
TTL/observability checks; implementation made them pass. Final command results,
current counts, coverage and preservation inventory are recorded in
[evidence](../evidence/2026-10-03-jump-0-3-hardening.md).
Format, lint, typecheck, unit/coverage, CI knip, full knip, peers and local
Cloudflare dry-run pass. Worker runtime and browser E2E cannot listen on localhost
(EPERM), so no runtime/browser case is claimed as passing.

Known Undici High remediation is now REMEDIATED_IN_LOCK: pnpm generated the
exact 7.29.0 -> 7.29.1 replacement for both paths using cached mirror metadata.
No release-age exception, registry switch or advisory ignore was used. Frozen
patched installation and fresh registry audit remain environment blocked. The
installed harness dependency remains 7.29.0; validations do not certify the
patched installed runtime. See [closure evidence](../evidence/2026-10-03-jump-0-3-closure.md).

The existing dispatchFetch harness already exercises workerd. Inspection confirmed
this pinned Miniflare unconditionally requires internal TCP listeners, so local
EPERM cannot be closed through a supported socket-free API. Worker/browser runs
remain required CI gates. Operator actions and exact CLOSED conditions are in
[release closure](../docs/operations/release-closure.md).

## Findings disposition

IDs are assigned in this 0.3 record; A/B/C refer to the requested ownership groups.

| ID  | Group                  | Disposition      | Finding and result                                                              |
| --- | ---------------------- | ---------------- | ------------------------------------------------------------------------------- |
| F01 | A                      | FIXED            | pnpm 12 settings verified; no auto-switch/download or new engine enforcement    |
| F02 | A, environment blocked | EXTERNAL_BLOCKER | Known Undici High fixed in lock; frozen install/fresh audit need mirror access  |
| F03 | A                      | FIXED            | Native invocation logs/traces ON, persistence/sampling/redaction frozen         |
| F04 | A                      | FIXED            | 0.3 current record and compatibility replace historical current-status links    |
| F05 | A                      | FIXED            | URL-visible short-lived OAuth values distinguished from forbidden credentials   |
| F06 | A                      | FIXED            | Native retention only; no implemented 30-day archive claim                      |
| F07 | A                      | FIXED            | Registry purpose/trust/outage/integrity documented                              |
| F08 | A                      | FIXED            | Actual unused exports removed; consumed test utilities retained                 |
| F09 | A                      | FIXED            | Reuse NUL, registered kid 127/128, prelookup 129, URL/TTL/config boundaries     |
| F10 | A                      | FIXED            | Inbound maximum 30 seconds, fractional/time boundaries preserved                |
| F11 | A                      | FIXED            | 0.3.0 runtime/health/fixture/docs inventory synchronized; package already 0.3.0 |
| F12 | B                      | EXTERNAL_BLOCKER | Reported Rails Rack URL comparison differs from normative WHATWG semantics      |
| F13 | B                      | EXTERNAL_BLOCKER | GitHub required-check enforcement unverified; no remote change                  |
| F14 | B                      | EXTERNAL_BLOCKER | Real rollback-compatible immutable Worker version not verified                  |
| F15 | B                      | EXTERNAL_BLOCKER | Rails must accept outbound structural TTL of 30 seconds                         |
| F16 | C                      | DEFERRED         | Signing-material failure cache unchanged                                        |
| F17 | C                      | DEFERRED         | Malformed JWKS negative cache and broad retry policy unchanged                  |
| F18 | C                      | DEFERRED         | Node 24 / typings 26 mismatch excluded; versions unchanged                      |
| F19 | C                      | DEFERRED         | External log export/archive and extended retention not implemented              |
| F20 | C                      | ACCEPTED_RISK    | Native platform pathname/generated metadata persistence                         |
| F21 | C                      | ACCEPTED_RISK    | Prerelease Miniflare itself retained; separate undici advisory is F02           |

## Release gates

`LOCAL_IMPLEMENTATION_STATUS = COMPLETE`.
`LOCAL_SECURITY_REVIEW_STATUS = NO_KNOWN_MEDIUM_OR_HIGH_APPLICATION_FINDINGS`.
`DEPENDENCY_REMEDIATION_STATUS = REMEDIATED_IN_LOCK_INSTALL_AND_AUDIT_BLOCKED`.
`WORKER_RUNTIME_STATUS = BLOCKED_ENVIRONMENT_CI_REQUIRED_GATE`.
`E2E_STATUS = BLOCKED_ENVIRONMENT_CI_REQUIRED_GATE`.
`EXTERNAL_RELEASE_GATE_STATUS = BLOCKED`.
`VALIDATION_STATUS = PARTIAL_BLOCKED_ENVIRONMENT_AND_AUDIT`.
`GITHUB_RELEASE_GATE = BLOCKED_UNTIL_ENFORCED`.
`ROLLBACK_ARTIFACT = NOT_VERIFIED`.
`ROLLOUT_STATUS = BLOCKED_FOR_ROLLOUT`.

GitHub administrator must enforce quality, unit/coverage, worker-runtime, e2e,
secret-scan and cloudflare-dry-run. Dependency audit must pass as well. Source
workflow presence is not enforcement. Real receiver URL and TTL acceptance,
production bindings/traffic and a real recovery artifact remain external tasks.
No Rails changes, deploy, secret/DNS/settings changes, commit or push occurred.
