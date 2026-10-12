# Jump 0.4.0 candidate release gates

Decision: **RELEASE_BLOCKED**. Source version 0.4.0 is an unreleased candidate;
JWT schema remains 1. Baseline HEAD is
`0e0b3c62057ecfdf373dc463853efa7fe7255ba6`. Changes are uncommitted because this
session mounts `.git` read-only. Do not equate the baseline SHA with the tested
candidate tree. No deployment, private-key operation, remote setting change,
push or ruleset change was performed.

| Required release condition                       | Status       | Evidence or remaining work                                                                                                       |
| ------------------------------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 1. Internal redirect safety                      | BLOCKED      | Graph, signed paths and query regressions pass locally; live receiver secondary redirects and full route inventory not proven    |
| 2. Strict direct pathname                        | PASS         | Raw/canonical checks, negative/positive and signed regressions                                                                   |
| 3. Origin/path denylist implementation and audit | BLOCKED      | Static immutable policy and audited logout routes implemented; live route/owner acceptance and deployment inventory remain       |
| 4. Prohibited domains                            | PASS         | Parsed-host equality/dot-boundary matching, production registry guard, no disabling flag                                         |
| 5. OAuth RFC conformance                         | BLOCKED      | Jump boundary tests and Rails source inspection; actual authorization-server/client integration and registration evidence remain |
| 6. Permanent external rejection                  | PASS         | Existing internal-only regression and signed production graph remain                                                             |
| 7. External removal at correct phase             | BLOCKED      | Owner confirmed non-use and authorized local removal; source retirement implemented, runtime/CI/production closure pending       |
| 8. Light layout                                  | NOT VERIFIED | Local CSS implemented and contrast checks pass; rendered/browser review blocked                                                  |
| 9. OS dark mode                                  | NOT VERIFIED | CSS-only implementation, palette tests and Playwright cases added; browser execution blocked                                     |
| 10. Existing security contract                   | PASS         | Local cryptographic, graph, key/revocation, TTL, header and semantic regressions pass; no production claim                       |
| 11. All required CI                              | BLOCKED      | GitHub API connection unavailable; worker/browser listening blocked; secret-scan executable absent                               |
| 12. No Critical/High dependency findings         | BLOCKED      | Configured registry audit endpoint cannot resolve/connect; absence of findings is not proven                                     |
| 13. Docs/ADR/fixtures                            | BLOCKED      | Candidate contracts/version/CHANGELOG updated; strategic review file not found and operational gates remain open                 |
| 14. Immutable tested rollback                    | NOT VERIFIED | Local dry-run bundle is not an immutable deployed recovery version; B-compatible runtime and receiver recovery tests required    |
| 15. Production settings/receiver proof           | BLOCKED      | Public read-only fetch unavailable; no binding/version/usage window, Rails runtime URL/TTL or key rotation proof                 |

No required condition is waived. No requested gate is NOT APPLICABLE.

## Reviews and commits

The diff can be reviewed in these phase groups; these are not claimed commits:

1. Phase 1: exact Node pin, existing Markdown formatting repair, no dependency
   ignore/override changes and frozen offline install evidence.
2. Phase 2/5: redirect_policy, normalize_url, handle_jump, registry guard,
   path and production regressions, OAuth fixture correction and policy docs.
3. Phase 3: owner-authorized local Cushion/IDNA/asset removal; production closure remains blocked.
4. Phase 4: page/security_headers/public headers and UI/contrast/E2E tests.
5. Phase 6: service/package/fixture version 0.4.0, CHANGELOG, compatibility and
   release/evidence records.

Security and UI changes should be committed separately by an operator in a
writable checkout after review. Local source retirement is implemented; do not claim runtime or production closure.

## Rails and rollout dependencies

Read-only Rails source revision:
`2a1644f73238839ed7ed513bd4681ea393a86682`. No Rails change or commit was made.
Current Auth `redirect_to_base_sign_out!` issues RTs to the now-denied Base
`/sign/out`, and Base/Core/Warp GET completion consumes logout notice state or
continues logout. The candidate intentionally refuses these routes. Legitimate
logout requires a reviewed transition redesign or proven route-specific contract
before rollout; merely deleting a query value or weakening Jump cannot fix it.

The registration policy uses exact URI membership and binds by realm when
provided; authorization request resolution requires code/S256/state/nonce,
and token exchange checks code URI consistency. These are source observations,
not proof that all live clients, realms, parser boundaries or TTLs pass.

Receiver owners must run the updated shared fixture in Rails and actual
Jump→Rails integration, demonstrate 30-second TTL acceptance and expiry/signature
boundaries, prove canonical duplicate-preserving query parsing and provide JWKS
Cache-Control/key-rotation and real emitted-path evidence. Keep production/staging
typ differences; production typ migration is a separate coordinated release.

After receiver/issuer compatibility tests, run candidate CI, real workerd and
browser Light/Dark/mobile/desktop/OS-change tests in an environment with TCP
listeners. Obtain immutable B-compatible recovery/version identifiers and test
rollback, then gather actual production binding/routing/observability inventory
and an approved redacted external-RT observation window. Explicit owner confirmation of Cushion non-use authorizes the completed local
capability/CSP removal. The splash back script, shared defenses and permanent
external rejection tests remain. Runtime and production closure still requires
the evidence above. Deployment requires explicit approval.

Existing detailed requirements remain in [release closure](release-closure.md),
[key rotation](key-rotation.md) and [rollback recovery](rollback-recovery.md).
