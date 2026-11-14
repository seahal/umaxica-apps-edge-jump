# OAuth opaque state remediation

Date: 2026-10-11 (Asia/Tokyo). Base HEAD: `0e0b3c62057ecfdf373dc463853efa7fe7255ba6`, branch `feature`, pre-existing dirty 0.4.0 candidate preserved. Source and tests changed locally; no deployment or external configuration changes.

## RED → GREEN

Independent reproductions: `/tmp/jump-review-acceptance/test/independent-query.test.ts` and `test/independent-signed-policy.test.ts`, unchanged during remediation. Acceptance report: `/tmp/jump-acceptance-report.md`.

New signed regression cases in `test/production-contract.test.ts` use generated ES384 test keys, not production keys. Before the fix, `pnpm exec vitest run test/remediation-contract.test.ts` in the complete isolated installed tree failed: 227 PASS / 5 FAIL, exit 1. The five new state cases failed before response/claim preservation assertions. After the fix the same cases and both independent reproduction suites passed: 465 tests, exit 0 (before adding 13 negative cases).

The fix scopes raw backslash rejection to authority/direct path; decoded direct path validation remains before and after URL normalization. Whole-URL encoding and control checks remain. Opaque state and nonce values are never rewritten by decoding; existing canonical query serialization remains shared by Location and signed output claim. Origin graph, Path Denylist, signature, schema, TTL and indirect redirect rejection were not changed.

New tests verify signed 302, state/nonce semantics, independent output signature verification and exact output claim/Location consistency, direct `%5C`/`%2F`/`%25` rejection, duplicate state/nonce, encoded controls, malformed percent encoding, next/return_to default rejection and OAuth redirect_uri outside the direct graph.

## Fresh checks

Commands ran in `/tmp/jump-runtime-acceptance/repo` with a complete copied dependency tree, Node 24.21.0 and the pinned pnpm 12.0.0 executable. Modified source/test files were synchronized from the actual checkout. This validates the installed tree, not a fresh network installation.

| Command                                                                           | Result                                                                         |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| pnpm run format:check                                                             | PASS, exit 0                                                                   |
| pnpm run lint:check                                                               | PASS, exit 0                                                                   |
| pnpm run typecheck                                                                | PASS, exit 0                                                                   |
| pnpm run test                                                                     | PASS, exit 0; 19 files, 1,313 tests                                            |
| pnpm run test:cov                                                                 | PASS, exit 0; statements 99.66%, branches 99.26%, functions 100%, lines 99.71% |
| KNIP_DISABLE_RAW_TRANSFER=1 pnpm exec knip --include unlisted,unresolved,binaries | PASS, exit 0                                                                   |
| pnpm run cloudflare:check                                                         | PASS, exit 0, Wrangler dry-run only                                            |
| pnpm run test:worker                                                              | BLOCKED, exit 1, listen EPERM 127.0.0.1                                        |
| pnpm run test:e2e                                                                 | BLOCKED, exit 1, web server listen EPERM 127.0.0.1:4173                        |

Initial `pnpm exec vitest` in the actual checkout attempted dependency installation and could not fetch from npm.flatt.tech (DNS no connections available); no test result was obtained there. Complete copied dependencies enabled isolated test execution. Fresh frozen installation remains BLOCKED by network access. Candidate-specific mandatory CI has not run; BLOCKED pending an accessible immutable candidate/CI environment. Dry-run does not prove production bindings or network behavior.

## Rails logout investigation

Read-only source review at Rails HEAD `2a1644f73238839ed7ed513bd4681ea393a86682`:

- `app/controllers/auth/app/sign/outs_controller.rb:19` calls `redirect_to_base_sign_out!`; lines 64 onward issue a Jump RT to Base sign-out.
- `app/controllers/base/app/sign_outs_controller.rb:30` GET show invokes browser continuation or `complete_oidc_rp_logout!`.
- `app/controllers/concerns/oidc_rp_logout_launcher.rb:79` GET continuation renders confirmation; POST completes the transaction.
- Same concern line 147 checks session notice, face and constant-time state matching, then consumes a sign-out notice. This remains a GET state change even though protected by session/state checks.

This is a legitimate existing flow, but its necessity does not establish that the GET target meets Jump's safe-path contract. No deny rule was removed. A coordinated alternative should keep the Jump landing GET read-only and move notice consumption/completion into a receiver POST with transaction/CSRF protections; receiver runtime tests are required before selecting or permitting an alternative. Rails is outside writable roots, so no Rails implementation was changed or claimed verified.

## Release status

RELEASE_BLOCKED. ADR 0007 Phase 3 Cushion retirement and real-browser Dark Mode verification remain mandatory and incomplete. Dependency audit, workerd, Playwright, frozen install, mandatory candidate CI and receiver/production evidence must be confirmed in an appropriate environment. Original repository .git is read-only under the current permission profile; no original-repository commit can be created here. An isolated immutable Git snapshot can identify the review candidate without changing that repository. Local fix success is not production release approval; independent full-release re-evaluation remains required. Limited independent re-evaluation of AC-062 and AC-085 completed: PASS, 496 tests, including unchanged reproductions; `/tmp/jump-ac062-ac085-remediation-review.md`. Other acceptance blockers remain outside this limited PASS.

## Additional dependency checks

Fresh `pnpm audit --audit-level=high` ended with exit 1, ERR_PNPM_AUDIT_BAD_RESPONSE and npm.flatt.tech DNS no-connections failure: BLOCKED. `timeout 20 pnpm install --frozen-lockfile` in the isolated immutable source checkout ended with exit 124 after dependency fetch DNS errors: BLOCKED. A second time-bounded audit attempt also timed out (124); no clean audit is asserted.
