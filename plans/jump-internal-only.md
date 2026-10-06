# Jump internal-only implementation plan

Status: discussion draft (2026-10-04). Implementation is stopped. Resume only on
an explicit instruction after discussion; this plan is not execution authority
or a claim of deployed behavior.

## Document map

| Document                                                | Responsibility                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| [ADR 0007](../adr/0007-remove-external-destinations.md) | Ownership, rationale and proposal boundaries; remains proposed     |
| [Target contract](../docs/internal-only-gateway.md)     | Redirect/rejection rules, test partitions and validation reference |
| [Dated memo](../memo/2026-10-04-jump-internal-only.md)  | Findings, blockers, caller uncertainty and current stopping point  |
| This plan                                               | Execution order, phase gates and cleanup boundaries                |

Primary repository: `umaxica-apps-edge-jump`. Rails cleanup, Away implementation
and `/about` fallback removal are separate work. Current observations belong to
the memo/evidence, not to an assertion that this plan is already complete.

## Phase 1: verify and record the production baseline

1. Reconfirm branch, HEAD and worktree state. Preserve unrelated dirty changes.
   Use a normal local Git branch when the environment permits it.
2. Mechanically verify all production issuer external policies, the internal
   graph, registry import paths and any env/binding configuration alternatives.
   Do not invent a setting change when external is already disabled.
3. Execute existing signed external tests for every production issuer: non-3xx,
   no Location and no cushion. Record gaps in explicit assertions honestly.
4. Establish the internal semantic regression baseline defined in the target
   contract, without snapshotting variable token bytes or timestamps/jti.
5. Audit callers, including dynamic dst forwarding, in the actual requested
   Rails/Edge checkouts and tests/fixtures/docs. Distinguish confirmed, not found
   and not proven; a default internal argument does not prove external non-use.
6. Identify the deployed artifact/revision through safe read-only access. Review
   any audited/deployed difference before considering deployment; do not deploy
   merely to match repository HEAD.
7. Inspect accessible production usage with an observation window and coverage
   limits, without tokens, secrets, full URLs or raw log dumps.

Checkpoint: configuration and contracts are verified, local/CI checks are green,
deployed configuration/provenance is established and usage gaps are explicit.
Access failure can be documented but is not successful verification. Do not
proceed to Phase 2 before this checkpoint is verified.

## Phase 2: enforce runtime rejection through TDD

Prerequisites: explicit resumption, verified Phase 1 and a compliant runnable
validation environment. Resolve dependency/Git environment problems separately;
do not silently change dependency policy or bypass security rules to run tests.

1. Review existing internal contracts and the proposed A-F tests against the
   target contract. Preserve schema 1 and required dst.
2. Observe RED with real test signatures and an intentionally external-enabled
   fixture. The external/external and external/internal cases must fail because
   the current runtime accepts them, not because the harness cannot start.
3. Make only the smallest runtime change that rejects external capability.
   Preserve canonicalization, internal allowlists, signing, RT semantics,
   redirect status/Location and `/about`. No fallback or Away bridge.
4. Observe GREEN and run existing internal regressions. Adapt old runtime
   cushion-success assertions to rejection while retaining useful dormant
   renderer coverage separately until Phase 3. Do not weaken broad regressions.
5. Run the formal local and CI checks listed in the target contract. Record the
   tested revision and failures; package-manager startup errors are not RED.
6. After local and CI GREEN, deploy through the normal repository workflow and
   use existing safe production internal smoke/observability paths. Do not run
   destructive or unsafe external probing.

Checkpoint: runtime rejection is GREEN, internal semantic contracts are
unchanged, CI is GREEN and deployed internal behavior is safely verified.
Do not proceed to Phase 3 on local results alone.

## Phase 3: remove dormant external implementation

Only after Phase 2 production verification, review and remove actual dormant
external dependencies in a separate change. Candidates include the success
branch, cushion renderer, external allowlist policy/configuration, external-only
UI/strings/script/CSP, success fixtures/tests and obsolete external-flow docs.

Individually review shared URL normalization, IDNA, headers, product CSS used by
`/about`, document layout, errors, logging, deadline and rate limit. A reference
from cushion code does not establish that shared code is external-only.

Retain schema 1 and required dst, and permanently retain external,
disguised-external, missing/unknown/malformed rejection regressions. Validate
local → CI → deploy → safe production behavior again for this phase.

## Separate changes and operating restrictions

Rails issuer API/caller cleanup is a later task. `/about` fallback removal has
its own commit, acceptance criteria and tests if subsequently requested. Neither
is bundled into external retirement or used as a fallback.

No direct GitHub file/API code edits, Git Worktree, force push, ruleset bypass,
secret retrieval, production credential changes, trust expansion or unrelated
refactoring. Documents must not claim runtime or deployment completion before
corresponding evidence exists. ADR acceptance is a separate status decision;
this plan does not change it.
