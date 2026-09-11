# Jump rate-limit simplification

Removed the JWKS and informational-route Rate Limiting bindings. Only requests
to `/` use `JUMP_RATE_LIMITER`; JWKS, health, informational, discovery, and
static-asset routes bypass application-level rate limiting. A failure of the
remaining supplemental binding now fails open and emits fixed, non-request
diagnostics.

Checks performed on 2026-09-12:

- `pnpm run format`: passed.
- `pnpm run lint`: passed.
- `pnpm run typecheck`: passed.
- `pnpm exec vitest run test/jump.test.ts test/evidence-layout.test.ts`: 158
  tests passed.
- `pnpm run cloudflare:check`: dry-run completed; the binding summary contained
  only `JUMP_RATE_LIMITER` at 600 requests per 60 seconds. Wrangler could not
  write its optional debug log under the read-only home configuration path.
- `pnpm run test`: 159 tests passed; two unrelated Dev Container invariant
  tests could not run `git ls-files` because the environment returned
  `spawnSync git EPERM`.
