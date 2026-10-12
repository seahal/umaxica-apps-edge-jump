# Jump 0.4.0 path boundary remediation

Date: 2026-10-11 (Asia/Tokyo).
Branch: `feature`. Base HEAD: `0e0b3c62057ecfdf373dc463853efa7fe7255ba6`.
The candidate is uncommitted on top of pre-existing dirty work. No new commit SHA, push, deployment, key retrieval or Rails modification was performed.
Overall completion: **BLOCKED** because the required real workerd check could not execute. Local Hono/unit verification passed. Release: **RELEASE_BLOCKED**.

## Inputs and scope

The user requested implementation according to `sol61_jump_hono_path_remediation_prompt.md` and placement/reconciliation of `jump_0_4_path_boundary_design.md`.
Input SHA-256 values:

- Implementation prompt: `6aefd46ccdacfd888215da7c046cb9bc329dabe69ec47e0998e4a2a70d12e985`.
- Supplied design: `9814c47f4302b30dc6ae122b1bbf9b2b5defd85342d078ceeba2dfbfbcd1a361`.

Read the current AGENTS, ADR 0007, redirect policy, prior audit and 0.4.0/opaque-state evidence, source registry and denylist, signed contract tests, runtime harness and prior acceptance report. Current source, not a remote copy, was the baseline. Prior evidence and ADR history were not rewritten.

Changes made in this task:

- `src/core/redirect_policy.ts`: compare the format suffix after removing one terminal slash from a comparison-only pathname. Navigation target bytes are not repaired or rewritten by this comparison.
- `src/core/normalize_url.ts`: preserve raw path by separating explicit HTTPS URL components; validate encoding and controls per component. Only parsed WHATWG origin authorizes origin edges; direct-path syntax remains separate from OAuth query values.
- `test/path-boundary-contract.test.ts`: new policy/syntax/signed Hono tests using ephemeral ES384 keys and real allowed registry edges to every denylisted origin.
- `scripts/test-worker.mjs`: add 12-origin real-workerd denial and positive regression cases; execution remains blocked.
- `docs/redirect-policy.md`: update implemented matching/encoding contract and link the design and evidence.
- `docs/security/jump-0-4-path-boundary-design.md`: reconcile and retain the supplied rationale, threat model, specification, residual risk and maintenance process.
- `docs/security/rails-jwks-refresh-escalation.md`: requested Japanese escalation report and independent local ticket `RAILS-JWKS-P0`. P0 is the user's remediation priority, not a proven CVSS Critical rating or outage.
- This evidence file.

The existing files `redirect_policy.ts` and `docs/redirect-policy.md` were untracked candidate work before this task. This task extends them rather than attributing their entire contents to this remediation. Existing layout, themes, Cushion retirement, registry topology, JWT protocol, signer, headers and Rails source were preserved.

## Execution identity

Tests ran on a copy of current source at `/tmp/jump-path-remediation-qy5y50qo` with `/tmp/jump-review-acceptance/node_modules` linked as the installed dependency tree. The copied dependency lockfile matches the checkout (SHA-256 `aa84f953407eb633a8efc7c03059c0e500f1ba5c4e729943b84919f94fe82ccc`). This is installed-tree validation, not proof of a fresh network installation.

Pinned pnpm 12.0.0 was invoked from the existing cached binary:

```text
/home/mslo/.local/share/pnpm/package-manager-store/v11/links/@pnpm/exe.linux-x64/12.0.0/382362077e0c773c8c688d9fc8c25956287978d07be3f9e34a0d0938b0397a72/node_modules/@pnpm/exe.linux-x64/pnpm
```

Node: 24.21.0. Source and formatted changes were synchronized between checkout and isolated test copy. Formatting/lint mutation scripts ran in the copy to preserve unrelated working-tree edits.

The seven-file implementation/test/document candidate manifest at `/tmp/jump-path-candidate.json` has SHA-256 `50301b55fc97c196aa58fff383a2ba5bd6e091506da9ea76af44095e301a8c8d`. This content identity, alongside the base HEAD, distinguishes the dirty candidate from the committed baseline. The evidence file is excluded from that manifest to avoid self-reference.

| Candidate file                                   | SHA-256                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `src/core/normalize_url.ts`                      | `ba77b7635d582c9353e5967af9195c74f26d7c644aec37af04a5cab5625179d1` |
| `src/core/redirect_policy.ts`                    | `f7b10c78b68911c72f7b012beccafc5d3a2ca922c3c5aee120fbb9b78e508aab` |
| `test/path-boundary-contract.test.ts`            | `2be1fd9adf3b1e540b97152c8b13af4dcc3a130e8a5d0b1c39c244b47e6195ac` |
| `scripts/test-worker.mjs`                        | `1a43869834e091e33b6870754215c464c62da7eae4f1d191f55c074e710da1e8` |
| `docs/redirect-policy.md`                        | `dabbc569e7ad9f8d77d84d6471dbe21fb5509e4432971786d63213b31f8ec628` |
| `docs/security/jump-0-4-path-boundary-design.md` | `af4233d6b502e36ed8455c39571ff76cf4fefd8df1fbc40f3972e5132732953c` |
| `docs/security/rails-jwks-refresh-escalation.md` | `7d74d4c180dbdc85cef29b39e9c93b1e8d7bc64d9787001596c918f2b4f8529a` |

## Observed RED and GREEN

Before changing production source, added `test/path-boundary-contract.test.ts` and ran `pnpm exec vitest run test/path-boundary-contract.test.ts` against the baseline source copy.
Result: **216 failed / 590 passed / 806 total**, exit 1. Failures included policy acceptance and signed HTTP 302 where rejection was expected. This was an actual assertion failure, not a startup/environment error.

After changing the two source files, the same command passed **806/806**, exit 0.
The twelve origins are exactly registry origins excluding Palm: Auth/Base/Core/Warp across APP/COM/ORG. Tests derive and independently compare this set with the production graph fixture. Each signed test selects an issuer that has a real allowed edge to the target, so an origin rejection cannot masquerade as path denial.

| Matrix                          | Cases and guarantees                                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 12 denial forms × 12 origins    | Base path, slash, `.html`, `.html/`, `.json/`, arbitrary/uppercase/multi-dot formats, encoded dot/letter, empty format. Direct policy and signed Hono requests both reject.                                                    |
| 18 ambiguous forms × 12 origins | Multiple slashes, semicolon, raw/encoded/mixed dot segments, upper/lower encoded slash/backslash, encoded percent/multiple encoding, controls, bad UTF-8/percent. Raw/normalized target validation and signed requests reject. |
| 7 allowed forms × 12 origins    | `/sign/outbox`, `/sign/out/edit`, ordinary `.html` with/without slash, Unicode path, opaque backslash state, and OAuth redirect_uri/state/nonce preservation.                                                                  |
| Rejection effects               | HTTP 400, no Location, signer spy called zero times, no inbound token in body/audit, no raw target in audit, no-store/no-referrer/CSP/no-cookie retained.                                                                      |
| Successful effects              | HTTP 302, exactly one RT, one signer call, independently verified ES384 output, exact output claim/Location canonical URL, origin/source/schema/replay/TTL maintained.                                                         |
| Existing suite                  | 13 nodes, 20 allowed edges, 149 denied pairs, invalid JWTs and `dst: external` remain covered and pass.                                                                                                                        |

Comparison is case-sensitive for base path names; uppercase format suffixes are denied. Unknown receiver-side case folding is outside the established contract and remains a route-integration requirement. No Rails router was copied into Hono.

## Executed checks

| Command                                   | Current result                                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm run format`                         | PASS, 165 files before adding this evidence.                                                                                                                                         |
| `pnpm run format:check`                   | PASS.                                                                                                                                                                                |
| `pnpm run lint:check` and `pnpm run lint` | PASS, no warning in this candidate.                                                                                                                                                  |
| `pnpm run typecheck`                      | PASS.                                                                                                                                                                                |
| `pnpm run test:cov`                       | PASS: 20 files, 2,113 tests; statements 99.65%, branches 99.23%, functions 100%, lines 99.69%; configured thresholds pass.                                                           |
| `pnpm run test`                           | PASS: 20 files, 2,113 tests.                                                                                                                                                         |
| `pnpm run test:worker`                    | BLOCKED, exit 1: `listen EPERM 127.0.0.1` before workerd assertions. Newly added runtime cases are not runtime-verified.                                                             |
| `pnpm run test:e2e`                       | BLOCKED, exit 1: `listen EPERM 127.0.0.1:4173` during web-server startup; no browser case executed.                                                                                  |
| `pnpm run cloudflare:check`               | PASS, Wrangler dry-run only: bundle 289.49 KiB, gzip 70.29 KiB. Isolated XDG config and metrics disabled. Existing multi-environment warning; no configuration change or deployment. |
| `pnpm audit --audit-level=high`           | BLOCKED, exit 1: `ERR_PNPM_AUDIT_BAD_RESPONSE`; advisory endpoint DNS failure at npm.flatt.tech. Supply-chain policy was not disabled.                                               |
| `git diff --check`                        | PASS.                                                                                                                                                                                |
| Candidate CI                              | NOT RUN. Candidate remains uncommitted/unpushed; no candidate CI URL exists.                                                                                                         |
| Secret scan                               | NOT RUN. `gitleaks` executable is absent locally; CI secret-scan was not invoked. Test keys are generated in memory and no secret material was added.                                |

## Independent re-acceptance and remaining gates

A separate AI reviewer was given the exact manifest and matching isolated source, RED/GREEN/coverage logs, and the user prompt. Expected acceptance: no format-plus-slash aliases, no target repair, no denial of unrelated prefixes, query isolation, zero signing on denial, actual allowed edges for every target, and honest runtime limitations.

The reviewer independently verified all seven file hashes and reran the full suite: **20 files / 2,113 tests PASS**. Its final review found no local code blocker, confirmed query preservation and actual allowed-edge testing, and agreed on `BLOCKED` / `RELEASE_BLOCKED` because real workerd is mandatory. Independent Node/Hono review cannot replace workerd, Rails or production proof.

Release remains blocked by real workerd/browser execution, candidate CI and dependency audit, Rails receiver interoperability and the independent Rails JWKS P0 remediation. Existing legitimate Auth-to-Base logout RTs require coordinated routing agreement; denying known logout paths is not proof that normal Rails logout remains compatible. Production bindings, deployed identity, revocation and immutable rollback evidence remain external gates.

The supplied design overstated the original audit's 12-origin signed-request coverage; it has been corrected to 12-origin function validation plus one signed edge in the original audit. The new remediation suite actually covers signed requests to all twelve origins. The supplied Rails 8.1.4 reference was replaced with the source revisions actually observed; the application's exact locked Rails runtime remains unverified.

Final preservation check: all seven candidate hashes still matched the reviewed manifest. Comparing every pre-existing file with the task-start hash inventory found changes only in `docs/redirect-policy.md`, `scripts/test-worker.mjs`, `src/core/normalize_url.ts` and `src/core/redirect_policy.ts`. Other pre-existing dirty files and historical evidence were unchanged.
