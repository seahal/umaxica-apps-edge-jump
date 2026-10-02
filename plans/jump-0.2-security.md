# Jump 0.2 security implementation plan

Status: local implementation complete; validation partially blocked by environment. Review baseline and actual HEAD: develop,
5c82d5b3883840637481d13babfe5902db02f99a (2026-10-02).
Local implementation only; no commit, deployment, secret change or remote mutation.
Existing dependency upgrades, hook removal, workspace configuration and evidence are preserved.
Previous plans are historical; this plan supersedes their current routing/provider contracts.

## HTTP precedence

One adapter request ID and 1000ms deadline start at entry. Validate required canonical
origin and registry identity collisions first (503); bind Request URL origin (400);
unsupported methods (405, Allow GET, HEAD); parsed rt wrong-path/root query guards
(400); limiter binding/IP (503), call exception only (warning and continue), result
shape (503) or denial (429); assets/app; cryptographic JWT, URL and policy (400),
issuer dependency failures (503 temporarily_unavailable), signer bundle (503).
Deadline wins over late completion (504); unexpected exceptions (500). Every path
gets common headers, no cookie, and HEAD body suppression. Informational health
is process responsiveness, not signer readiness.

## Phases and acceptance

0. Inspect instructions, scripts, lockfile, historical ADR/plans and dirty changes;
   frozen install and baseline tests; record actual results.
1. Independent RED tests: literal graph, rpl, origin, bundle, limiter, path.
2. Outer config/error/deadline/header boundary and request binding.
3. Explicit graph, required reuse, canonical URL correspondence, explicit keyset.
4. Cache/failure/external regression and Fastly/implicit fixture removal.
5. 169 pure pairs, 20 signed Worker adapter edges using distinct issuer keys,
   frozen Base/Auth, EP/BVA, unit/coverage/browser/workerd and local dry-run.
6. Normative docs, receiver fixture, ADR, release/rollback/rotation gates and manifest.

## Requirement traceability

Each ID denotes the corresponding numbered request; acceptance groups are A–M.
Results below refer to local executed tests. Workerd/browser and normal frozen-install policy verification remain blocked; live acceptance is separate. See evidence/2026-10-02-jump-0-2-security.md for commands and counts.

| ID  | Requirement / groups               | Code                        | Tests                      | Documentation          | Result           |
| --- | ---------------------------------- | --------------------------- | -------------------------- | ---------------------- | ---------------- |
| R01 | Local scope, preservation          | package/lock                | install, baseline          | this plan, evidence    | inspected        |
| R02 | 13 nodes,20 edges / A–D            | registry,policy             | contract graph/runtime     | protocol, ADR          | local tests pass |
| R03 | Required identity / G              | normalize_url,adapter,index | origin/config              | origin runbook         | local tests pass |
| R04 | JWT reuse / E,F                    | verify_jwt,handle_jump      | claims/boundaries/reuse    | protocol,compatibility | local tests pass |
| R05 | rt, URL correspondence / F,H       | adapter,index,normalize_url | path/query/URL             | receiver contract      | local tests pass |
| R06 | Explicit nonextractable bundle / J | adapter,jump_jwks           | bundle/export spy          | key rotation           | local tests pass |
| R07 | Limiter narrow exception / I       | adapter                     | limiter matrix             | security, operations   | local tests pass |
| R08 | Deadline,error,logs / K            | adapter,index,headers       | failure/HEAD/logs          | logging, threat model  | local tests pass |
| R09 | Stateless bounded JWKS / K         | cache,fetch_jwks            | concurrency/cap/revocation | architecture           | local tests pass |
| R10 | Disabled production external / L   | registry,policy,cushion     | explicit DI external       | protocol               | local tests pass |
| R11 | Receiver ownership                 | contract fixture            | outbound correspondence    | receiver contract      | local tests pass |
| R12 | Cloudflare-only portable core      | adapter,package,knip        | no fallback                | ADR, README            | local tests pass |
| R13 | Independent TDD / A–M              | test fixtures               | RED/GREEN,mutation mapping | evidence               | local tests pass |
| R14 | Full validation                    | scripts                     | all requested commands     | evidence               | local tests pass |
| R15 | Compatible recovery                | none deployed               | local packet compatibility | rollback matrix        | rollout blocked  |
| R16 | Rotation                           | nonproduction bundle tests  | prepublish/active/grace    | rotation runbook       | rollout blocked  |
| R17 | Honest revision evidence           | manifest                    | diff hash                  | evidence, final report | local tests pass |

## Rollout gate

BLOCKED_FOR_ROLLOUT until real receiver/issuer reuse support, canonical bindings,
Worker version/config references, routes/DNS/TLS/Access/WAF/platform logs, live JWKS,
and a security-compatible rollback artifact are verified by the deployment owner.
Git SHA is not a Worker version. Previous 0.1 omits outbound rpl; waiting TTL does
not fix continuous issuance after rollback. No receiver emulator is in scope.

## Validation limits and TDD record

Baseline: 211 tests pass. Executable RED: 85 failed/201 passed before outer-boundary completion; subsequent focused stream-abort and URL-encoding regressions were reproduced before fixes. Dependency/harness failures prevented an executable RED before some initial graph/rpl edits; this is not claimed as perfect test-first coverage. Final unit and coverage: 410 tests pass, including independent 169-pair policy and 20 cryptographic adapter edges. Three isolated mutations are detected (extra edge, removed reuse validation, truthy limiter success).

R14 is PARTIAL: format:check fails solely on preserved pre-existing test-results/.last-run.json; modified task files pass targeted format checks. Browser and actual workerd cannot bind localhost (EPERM); no browser/workerd cases ran. Frozen install policy verification lacks offline metadata and network DNS; an explicitly trusted pinned-lock offline install restored dependencies, without modifying repository trust policy. No live receiver, platform settings or rollback artifact has been verified. R15/R16 remain BLOCKED_FOR_ROLLOUT. R17 is recorded by the evidence manifest.

## Additional 0.2 hardening contract

Additional hardening A-F: origin-cutover.md formalizes provider versus identity migration; key-rotation.md separates normal grace from emergency revoke; rollback-recovery.md defines compatible artifacts; cloudflare.ts adds cached readiness; readiness.test.ts covers focused contracts; test-worker.mjs exercises the bundled adapter in workerd and CI worker-runtime gates release. operations/readiness.md defines low-cardinality incident classification. All production and immutable-recovery evidence remains UNVERIFIED. This update does not authorize installation or deployment.
