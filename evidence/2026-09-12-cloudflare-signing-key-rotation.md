# Cloudflare signing-key rotation

## Result

- Generated a new ES384/P-384 key set with kid
  `cloudflare-active-2026-09-12-871e7273` outside the repository.
- The generator's private/public sign-and-verify self-check passed.
- Secret artifacts are mode `0600`; the containing directory is mode `0700`.
- `wrangler.jsonc` contains only the matching public JWK and kid and no longer
  declares a Secrets Store binding for the private key.
- The user uploaded Worker version
  `e28363bd-b039-438a-8c61-7d8bd6813b4b` with the new secret and deployed it at
  100% traffic.
- That deployment reported the unrelated non-versioned setting
  `observability.enabled: false`. The checked-in configuration was restored to
  `true`; the user redeployed the same version and Wrangler confirmed
  `observability.enabled: true`. Runtime Jump verification remains pending.

## Verification performed

- `pnpm install --offline --frozen-lockfile`: passed, 291 packages reused and
  zero downloaded. The preceding online frozen install could not reach the
  configured `npm.flatt.tech` registry because DNS/network access was
  unavailable.
- `pnpm run format:check`: passed.
- `pnpm run lint:check`: passed.
- `pnpm run typecheck`: passed.
- `pnpm exec vitest run test/jump.test.ts test/evidence-layout.test.ts`: passed,
  159 tests.
- `pnpm run cloudflare:check`: passed; dry-run showed the new kid and public
  JWKS as environment variables and no private-key binding in config.
- `pnpm run test`: 159 tests passed and two pre-existing Dev Container
  invariants could not execute `git ls-files` because the sandbox returned
  `spawnSync git EPERM`.

No private key material was included in this record or command output.
