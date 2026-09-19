# Jump security hardening (Cloudflare)

Date: 2026-09-19. Working tree after adding public error mapping, structured
security logs, Cloudflare Durable Object replay consume, special-use IP
defense-in-depth, canonical origin for robots/sitemap, and a `decompress`
advisory fix.

## Commands run

- `pnpm run format` / `format:check`
- `pnpm run lint:check`
- `pnpm run typecheck`
- `pnpm run test` — 184 tests, 4 files, all passed
- `pnpm run cloudflare:check` — Wrangler 4.132.0 dry-run succeeded; bindings
  include `JUMP_REPLAY` (JumpReplayObject) and `JUMP_RATE_LIMITER`
- `pnpm audit` — no known vulnerabilities after override

## Route matrix

`umaxica registry accepts exactly the 14 allowed edges of the 196 ordered pairs`
still enumerates 14×14 combinations, accepts 14 edges, rejects 182, and does
not skip cases. Rejected pairs now share the public class `invalid_request`
instead of leaking `invalid_dst` vs `invalid_claim`.

## Package audit

- Package: `decompress` 4.2.1, transitive via `@fastly/js-compute` →
  `@bytecodealliance/weval` 0.3.x.
- Advisories: GHSA-mp2f-45pm-3cg9 (critical), GHSA-h39j-r5qq-r9mm,
  GHSA-jwp9-9v96-94mx. No patched `decompress` release.
- Reachability: weval is Fastly compile-time, not on the Cloudflare request
  path. Jump never extracts attacker archives at runtime.
- Fix: pnpm override `@bytecodealliance/weval` to `0.5.0` (drops `decompress`,
  uses `tar`/`fflate`). `minimumReleaseAgeExclude` for that package only
  because 0.5.0 is newer than the 180-day floor.

## Fastly

UNVERIFIED — requires Fastly runtime/deployment verification. Shared public
error, URL, and logging contracts apply. Production Fastly still has no
verified signer, JWKS, or replay bindings.
