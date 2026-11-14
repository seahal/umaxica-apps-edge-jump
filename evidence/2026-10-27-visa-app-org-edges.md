# Visa APP and ORG edges

The local registry adds the APP and ORG Visa issuers and their 18 directed edges.
COM edges remain unchanged. The production contract test checks all 225 ordered
pairs, signed requests for the 38 allowed edges, issuer-specific keys, a
published `test-` kid, cross-realm refusal, and exact OAuth query preservation.

On 2026-10-27, using pnpm 12.0.0, `pnpm run format:check`,
`pnpm run lint:check`, `pnpm run typecheck`, and `pnpm run test` passed.
Vitest reported 20 files and 2,151 tests passed. These are local tests using
fixture keys; live Visa JWKS, deployed Workers, Rails receivers, and the owner's
browser sign-in and sign-out flows were not verified.
