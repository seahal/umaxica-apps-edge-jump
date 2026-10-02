# /ready endpoint removal — 2026-10-02

Owner decision: remove the `/ready` readiness endpoint, which was introduced in
commit `2f1aeb4`. Deployment verification now has three layers: `/health.json`
(liveness), `/.well-known/jwks.json` (pair-checked signing material) and a valid
signed RT smoke. No deployment, secret, DNS or wrangler rate-limit change was made.

## Changes

- `src/cloudflare.ts`: removed the `/ready` dispatch branch, `isReadinessRequest`
  and `readinessResponse`. Also removed the 5-second key-material failure backoff
  added earlier the same day (`2026-10-02-version-up-asvs-review.md`). Without
  `/ready`, every path that loads key material passes the native rate limiter
  first, so the backoff was not kept as separate state.
- `test/readiness.test.ts` was renamed to `test/signing-material.test.ts`. Its
  checks now run against `/.well-known/jwks.json`. New regressions cover:
  GET/HEAD `/ready` → 302 `/about` (notFound) with a valid or broken signer, and
  404 with JSON Accept; `/health` and `/health.json` → 200. The `/ready`
  regression failed (2 tests) against the HEAD `src/cloudflare.ts`.
- `scripts/test-worker.mjs`: the workerd cases use JWKS instead of `/ready`.
  `/health.json` stays 200 when the private key is missing. GET/HEAD `/ready`
  falls through to notFound.
- `docs/operations/readiness.md` was replaced by `deployment-verification.md`:
  health, JWKS, signed-RT and forbidden-edge smoke checks; the rate-limit
  contract; and the monitoring contract. README, architecture, security,
  threat-model, logging, production-configuration, ADR 0005 and the plan were
  updated.

The rate limiter is unchanged: native `JUMP_RATE_LIMITER`, namespace 520900,
600/60s, keyed on CF-Connecting-IP, applied before every route including
`/health*`. Existing failure semantics are unchanged: missing binding, missing
or invalid IP, or a malformed result → 503; a provider exception → fail-open.

## Executed checks (Node 24.21.0, pnpm 12.0.0)

- `pnpm run format:check`, `lint:check`, `typecheck`: passed.
- `pnpm run test`: 8 files / 462 tests passed.
- `pnpm run test:worker`: passed.
- `CI=1 pnpm run test:e2e`: 16 passed.
- `pnpm run cloudflare:check`: passed (dry run).
- knip (`--include unlisted,unresolved,binaries`) and `git diff --check`: passed.
