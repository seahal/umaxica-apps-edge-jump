# Jump internal-only investigation memo

Snapshot: 2026-10-04. Implementation was stopped at the user's request for
review and discussion. The subsequent document edits do not resume implementation,
validation runs, dependency repair or deployment.

This memo records findings and uncertainty; it is not the target specification
or an acceptance result. See [ADR 0007](../adr/0007-remove-external-destinations.md),
[the target contract](../docs/internal-only-gateway.md) and
[the implementation plan](../plans/jump-internal-only.md).

## Repository and implementation state

Audited checkout: `develop`, HEAD
`3c84a39430b7740c1563dcff3d593e058843b5da`.

- Static registry enumeration and the independent graph fixture agree on 13
  issuers, 20 allowed edges and 149 denied ordered pairs. The registry builder
  assigns external=false to every issuer.
- The production Worker imports that registry directly. No production
  env/binding override was found in the inspected adapter.
- Runtime still accepts externally allowlisted instructions through injected
  registries and renders a 200 cushion. No runtime rejection change was made.
- `test/internal-only.test.ts` contains proposed A-F contracts. It has not
  produced an observed RED or GREEN. Existing cushion-success tests remain.
- Schema 1, required dst, internal routing/signing, `/about` and Away connections
  have not been changed. No commit, push or deployment was performed.

## Environment blockers observed

The default pnpm executable was 12.4.2 while the repository requires 12.0.0.
Using the installed required executable reached dependency retrieval but failed
on registry DNS. Those failures occurred before Vitest startup.

Frozen installation also reported an overrides mismatch: the existing lockfile
contains `undici@7.29.0: 7.29.1`, without a matching repository overrides entry.
No repository manifest, workspace configuration or lockfile was repaired.
The prior startup attempt removed ignored dependency executables; subsequent
work began with `node_modules/.bin` and `.pnpm` absent.

The read-only `.git` environment prevented creating a normal task branch.
No Git Worktree or alternative remote code-edit path was used.

An isolated temporary verification copy at
`/tmp/jump-internal-only-verify-66n4681h` aligned only its copied workspace
configuration with the existing lockfile. Its offline frozen installation failed
on a missing cached `@vitest/istanbul-lib-coverage@1.0.2` tarball. No tests ran in
that copy; the repository dependency configuration remained unchanged. This
attempt occurred after the TDD preparation evidence record below.

## Production and caller uncertainty

Local validation and CI green are unverified. Shell access failed on DNS;
Cloudflare connector worker lookup failed and its returned inventory did not
include Jump. This does not prove Jump is absent from production. Deployed
revision, configuration correspondence and production external use remain unknown.
No observation window or external-success count was established. Do not treat
absence of accessible evidence as evidence of non-use.

The newly requested Rails reference path
`/home/mslo/Projects/ghq/github.com/seahal/umaxica-apps-jit-global` was not present.
No audit of that checkout was possible; do not silently substitute another path.
Earlier inspection of the differently named `umaxica-apps-global` found an API
capable of issuing external RTs and dynamic dst keyword forwarding. Explicit
external callers were not found there, but non-use was not proven. That result
is not an audit of the requested jit-global checkout.

## Evidence and resumption prerequisites

- [Phase 1 investigation](../evidence/2026-10-04-external-phase-1-baseline.md):
  PHASE_1_NOT_VERIFIED; static configuration confirmed, runtime/local/CI and
  production verification incomplete.
- [TDD preparation](../evidence/2026-10-04-internal-only-tdd-blocked.md):
  BLOCKED BEFORE RED; added tests are unexecuted, not behavioral failures.

Keep these dated evidence records intact. They are not successful acceptance and
must not be rewritten to imply that a later proposal is already deployed.

Before resumption, discuss and resolve the dependency environment, normal Git
branch capability and access to the actual production revision/observability.
Reconfirm branch, HEAD and existing dirty changes. The plan supplies the phase
order; document editing alone does not authorize execution.
