# Jump PS256 Key C Rotation (2026-11-14)

Operator: owner with Claude Code. Target: Cloudflare production Worker `umaxica-apps-edge-jump`.
Follows `plans/2026-11-14-key-rotation-on-this-machine-work-order.md` Part 1. Owner waived
compatibility/grace period. No private key material is recorded here or in the repository.

## Done

- Key choice: new key C; key B (`jump-prod-2026-11-12-ps256-f3b40484`) retired unused.
- Close: Cloudflare Access already in front of `jump.umaxica.net`; owner's
  `curl /health.json` returned 302 to `umaxica.cloudflareaccess.com`.
- Generate: `pnpm run keys:generate` under `umask 077` → `result=ok`, `algorithm=PS256`,
  `modulus_bits=3072`, `pair_check_ok=true`, kid `jump-prod-2026-11-14-ps256-b9126160`.
  Private files written only to `../secrets/umaxica-apps-edge-secret/` for owner's cold storage.
  Public JWKS committed as `keys/jump-prod-2026-11-14-ps256-b9126160.jwks.json`.
- `pnpm run cloudflare:check` passed.
- `wrangler versions upload` → `d443c784-c06f-472a-8793-49a3fab38e82`;
  `wrangler versions secret bulk` (PEM, KID, JWKS together) → `17bb3132-79b7-471b-ab50-a04412f9a7e0`.
- Owner ran `wrangler versions deploy 17bb3132…@100%`: SUCCESS. Previously active version was
  `b5939ac7-4a63-4660-a042-1ffe60f4ad39` (created 2026-11-14T00:26:08Z, no message; origin not
  identified in this session), not `8b73e1b8` as the work order expected.
- Verify (owner's browser through Access): `/.well-known/jwks.json` served exactly one key,
  `kty=RSA`, `alg=PS256`, `use=sig`, kid as above, no private members; `n` compared equal to the
  committed public JWKS, 3072 bits, `e=AQAB`.

- Reopen: owner removed Access; owner's `curl /health.json` without Access returned 200 with no
  redirect.

## Not done / open

- Valid-RT 302 / forged-RT refusal / forbidden-edge 400 checks: NOT_VERIFIED (no issuer key here).
- Step 7 (old versions holding keys A/B, backlog/handoff updates, Cosmos receivers to trust the
  new kid at `https://jump.umaxica.net/.well-known/jwks.json`): pending.
