# Internal-only gateway TDD preparation

Date: 2026-10-04. Status: **BLOCKED BEFORE RED**. Runtime enforcement is not
implemented or verified. This record does not supersede the incomplete Phase 1
production verification.

## Baseline and scope

- Branch: `develop`; HEAD: `3c84a39430b7740c1563dcff3d593e058843b5da`.
- Initial status contained only the prior untracked
  `evidence/2026-10-04-external-phase-1-baseline.md`; it was preserved unchanged.
- `git switch -c fix/internal-only-jump` failed: cannot lock/create the branch
  reference under the environment's read-only `.git`. No worktree, commit, push
  or deploy was performed. Changes remain in the existing checkout.
- No source/runtime, schema, registry, dependencies, lockfile, signing, `/about`,
  Rails, or Away files were edited. Existing cushion success tests are intact.

## Current contract reviewed

Read `handle_jump.ts`, `policy.ts`, `verify_jwt.ts`, `types.ts`, registry,
existing fixture/signing helpers, production contracts and CI scripts.
Schema 1 requires dst and recognizes exactly internal/external. Internal URL
validation and issuer internal allowlist precede outbound signing and 302.
External policy can still accept an explicitly allowlisted origin and render
200 cushion. The production registry disables that capability by configuration,
but injected registries can enable it. No runtime fix was made before RED.

## Added tests, not executed

`test/internal-only.test.ts` adds 27 cases with real ES384 issuer signatures and
test-only keys, preserving the existing harness conventions:

- A: allowed internal target checks 302, Location origin/path/query, one RT,
  outbound ES384 signature/header, exact required claims, schema 1, dst, issuer,
  audience, source, canonical URL, iat/nbf/exp, 30-second TTL and jti.
- B: internal discriminator with external URL must reject.
- C: external discriminator with explicitly external-allowlisted URL must reject.
- D: external discriminator with allowed internal URL must reject, even with
  that origin also in the external allowlist.
- E/F: 23 unknown/case/empty/whitespace/missing/null/type/NUL/encoding partitions
  with an allowed internal URL, forbidding discriminator inference. Undefined
  is tested as omission because JSON has no undefined wire value.
- Denial assertions require 400 invalid_request, non-3xx, no Location, splash
  body, no cushion continue/script, no Away/target links and no outbound signing.
  B/C/D also forbid accepted audit events and require rejection events.

C and D are expected to fail against the unchanged implementation because its
external policy explicitly allows both test origins and returns 200 cushion.
That is a source-based expectation, **not an observed RED test result**.

The existing production graph (20 allowed/149 denied), Worker adapter, workerd,
E2E and semantic receiver contracts were not changed or executed successfully.
No internal regression or GREEN claim can be made.

## Actual attempts and blockers

The repository requires pnpm 12.0.0; that installed executable was used rather
than bypassing version policy or using another toolchain.

1. `/home/mslo/.local/share/mise/installs/pnpm/12.0.0/pnpm install --offline --frozen-store --frozen-lockfile`
   exited 1 with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`: overrides differ. The
   dependency section of pnpm-lock.yaml contains `undici@7.29.0: 7.29.1`; no
   corresponding overrides entry was found in package.json/pnpm-workspace.yaml
   or .npmrc, and `pnpm config get overrides` returned undefined. No lockfile or
   config repair was attempted; the mismatch is separate from this feature.
2. `/home/mslo/.local/share/mise/installs/pnpm/12.0.0/pnpm run test -- test/internal-only.test.ts`
   was bounded by `timeout --signal=INT 15s` and exited 124. Startup attempted
   dependency tarball retrieval from npm.flatt.tech and emitted 252 DNS-failure
   messages. No Vitest banner, `vitest run` launch, or test failure summary was
   present. Thus this was a package-manager startup failure, not RED.

`node_modules/.bin` and `.pnpm` were already absent at the start of this turn;
the earlier Phase 1 record documents that environment side effect. Dependencies
remain unavailable. Further install/run retries were stopped after the above
attempts. Format, lint, typecheck, full unit/coverage, production contract,
workerd, E2E, knip, dependency checks and Cloudflare dry-run remain unverified.
CI/deploy/production verification were not attempted for this unfinished change.

`git diff --check` passed for the tracked ADR edit; this is not formatting,
linting, typechecking or application test success.

## Documentation and related repositories

ADR 0007 remains proposed, with no accepted-status change. Its proposal now
separates baseline verification, TDD runtime rejection and dormant-code removal;
it explicitly preserves schema 1 and required dst and forbids inference,
fallback and Jump-to-Away bridging. The current normative protocol document was
not changed to claim enforcement that does not yet exist.

The newly specified Rails path
`/home/mslo/Projects/ghq/github.com/seahal/umaxica-apps-jit-global` does not exist
in this environment. No audit of that checkout was possible; it was not silently
replaced with the differently named repository used in the prior investigation.

## Remaining work and deletion boundary

Restore a policy-compliant dependency environment and a writable normal Git
branch workflow, then execute the new tests to observe C/D fail for the intended
behavior. Only after observed RED may the minimal runtime change be made.
Existing cushion success assertions will then need deliberate migration:
runtime acceptance must become denial, while dormant renderer unit coverage may
be retained until the later physical-removal phase. Preserve permanent denial
tests and the existing internal semantic contracts.

Dormant candidates remain `handle_jump.ts` external success branch,
`render_cushion.ts`, `page.tsx` cushion renderer, external policy handling,
allowlist configuration, external-only strings and script CSP hash. URL
normalization/IDNA, security headers, product CSS (`/about`), document layout,
error responses, audit logs, deadline and rate limit are shared and must not be
deleted indiscriminately. No dormant cleanup was performed before GREEN.
