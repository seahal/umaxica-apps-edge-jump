# Stateless Jump architecture restoration

Date: 2026-09-19

Removed Cloudflare Durable Object replay consume so Jump is a stateless
multi-edge gateway again. Schema 1 tokens remain short-lived signed navigation
instructions and may be evaluated more than once until `exp`. Replay-sensitive
side effects stay a receiving-application responsibility (ADR 0002).

## Commands run

- `pnpm run format`
- `pnpm run lint:check` — 0 warnings, 0 errors
- `pnpm run typecheck` — pass
- `pnpm run test` — 3 files, 179 tests passed, including
  `umaxica registry accepts exactly the 14 allowed edges of the 196 ordered pairs`
- `pnpm run cloudflare:check` — wrangler 4.132.0 dry-run; bindings are
  `JUMP_RATE_LIMITER`, `ASSETS`, version metadata, and origin/JWKS vars. No
  Durable Object / `JUMP_REPLAY` binding.
- `pnpm audit` — no known vulnerabilities found

## Observed contract

- `src/core/replay_cache.ts` deleted.
- `JumpReplayObject`, `DurableObjectReplayCache`, and `JUMP_REPLAY` removed
  from `src/cloudflare.ts` and `wrangler.jsonc`.
- `verifyJumpJwt` / `handleJump` / `createApp` no longer take a replay cache.
- Internal `replay` / `replay_unavailable` error codes removed.
- Cloudflare and Fastly `createApp` runtimes accepted the same valid token
  with the same 302/Location origin in unit tests.

## Not verified

- Fastly Compute production deployment, signer/JWKS wiring, and live
  request path. Marked UNVERIFIED — requires Fastly runtime/deployment
  verification.
- Playwright e2e was not run in this record.
