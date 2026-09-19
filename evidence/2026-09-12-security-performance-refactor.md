# Security and performance refactor

## Changes

- The public Jump JWKS endpoint now uses the same cached key material as the
  outbound signer and publishes keys only after a private/public sign-verify
  pair check.
- Outbound public JWK validation now requires EC/P-384/ES384 signing keys,
  validates coordinate encoding, rejects duplicate kids, and rejects private
  JWK fields.
- Inbound JWT kids are limited to 128 characters before any cache access.
- The issuer registry lookup accepts own properties only.
- The issuer negative-kid cache removes expired entries and is capped at 1,024
  entries to prevent isolate-lifetime memory growth from attacker-selected
  kids.
- Oversized streamed JWKS responses are cancelled as soon as the 64 KiB limit
  is crossed.
- Secret-binding failure logs retain only the binding name and error class, not
  provider error messages.
- Deadline errors while reading bindings remain deadline errors instead of
  being converted to signer configuration failures.
- The successfully deployed rotation's temporary private-key files were
  deleted from `/tmp`; deletion is not recoverable.

## Verification

- `pnpm install --frozen-lockfile`: passed; 291 packages reused, zero
  downloaded.
- `pnpm run format:check`: passed.
- `pnpm run lint:check`: passed.
- `pnpm run typecheck`: passed.
- `pnpm run test`: 164 tests passed; two unrelated Dev Container tests were
  blocked because sandboxed `git ls-files` returned `spawnSync git EPERM`.
- `pnpm exec knip`: passed with no findings.
- `pnpm run cloudflare:check`: passed after the changes.
- `wrangler check startup`: Worker build succeeded, but startup measurement was
  blocked by sandboxed localhost `listen EPERM`.
- `pnpm audit --prod`: unavailable because the configured package registry did
  not respond in this execution environment; it was interrupted without a
  result and is not claimed as passed.

No deployment was performed for this refactor.
