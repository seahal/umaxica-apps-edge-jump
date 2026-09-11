# Issuer JWKS cache TTL

## Result

- Changed the default issuer JWKS cache TTL from 300 seconds to 30 seconds.
- Kept the existing immediate one-time refresh for an unknown `kid`, in-flight
  request coalescing, 10-second forced-refresh cooldown, and 30-second negative
  cache.
- Left the separate outbound signer/key-material cache unchanged because it
  does not fetch issuer JWKS.

## Verification performed

- `pnpm run format`: passed.
- `pnpm run lint:check`: passed.
- `pnpm run typecheck`: passed.
- `pnpm exec vitest run test/jump.test.ts test/evidence-layout.test.ts`: passed,
  160 tests including the new 30-second boundary test.
- `pnpm run cloudflare:check`: passed.
- `pnpm run test`: 161 tests passed; two unrelated Dev Container invariant
  tests could not execute `git ls-files` because the sandbox returned
  `spawnSync git EPERM`.
