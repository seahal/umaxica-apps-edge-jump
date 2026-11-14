# Jump Signing Key Rotation to PS256 (2026-11-12)

Operator: owner with Claude Code. Environment: Cloudflare production Worker `umaxica-apps-edge-jump`
(top-level configuration). The service is not in real use yet; the owner accepted that Jump may stop
and asked to observe its behavior with the new key. No private key, secret bundle or token is
recorded here.

## Done

- Algorithm changed from ES384 (P-384) to PS256 (RSASSA-PSS with SHA-256, RSA 3072-bit), matching the
  Cosmos signing decision. Runbook and configuration contract updated
  (`docs/operations/key-rotation.md`, `docs/operations/production-configuration.md`).
- New key B generated offline with Node `crypto` (RSA 3072, e=65537): kid
  `jump-prod-2026-11-12-ps256-f3b40484`; PS256 sign/verify pair check passed. Files kept outside the
  repository in the owner's `secrets/jump-ps256-2026-11-12/` for cold storage.
- B's private key added with `wrangler versions secret put UMAXICA_JUMP_PRIVATE_KEY_PEM` (read from
  the file through stdin, never printed). Result: Worker version
  `8b73e1b8-be84-418b-b669-d4aacfbe9a13`. **Not deployed.** `wrangler secret put` was refused because
  the latest uploaded version was not deployed.
- `wrangler.jsonc` vars: `UMAXICA_JUMP_PRIVATE_KEY_KID` set to B; `UMAXICA_JUMP_PUBLIC_JWKS` replaced
  by B's public JWK only (A, the ES384 key `cloudflare-active-2026-09-12-871e7273`, removed: the PS256
  code cannot use an EC key, and the service carries no live traffic, so no grace period was kept).
- Old local copies of A (`jump-ec-private-key.pem`, `jump-pkcs8-private-key.pem`, both P-384) were
  shredded from the owner's secrets directory.

## Not done / open

- Deploy: the PS256 code lives on the owner's other machine and was not on any remote branch at this
  time. Deploy one consistent version (PS256 code + B secret + the vars above), then check the
  pair self-check, `/.well-known/jwks.json` (B only), and an RT header `alg=PS256`, `kid=B`.
- Version `8b73e1b8` carries B's secret on top of the latest uploaded code; its vars are whatever
  that upload had. Verify before deploying it, or redeploy from the repository instead.
- A's private key still exists in older Worker versions and the currently deployed version; it stops
  signing once a B version is deployed. Prevent redeploying old versions.
- Receivers (Cosmos `JumpRtReturnVerifier`) still expect ES384 and must move to PS256 with B's JWKS.
- `scripts/generate-jump-keypair.mjs` in this checkout still generates P-384.

## Early deploy to observe a mismatched key (owner-requested, 2026-11-12)

The owner asked to deploy before the code and public values were ready, to see how Jump behaves
with a key that does not match.

- Deployed version `8b73e1b8-be84-418b-b669-d4aacfbe9a13` at 100% with
  `wrangler versions deploy ... --env=""` (message "Observe Jump with PS256 key B (owner-requested
  early deploy)"). Previously active: `0d0f9206-f1b1-428d-b1ee-fdf085c55479` (ES384, deployed
  2026-10-27).
- Bindings of the deployed version (read through the Cloudflare API; secret values are not
  returned): `UMAXICA_JUMP_PRIVATE_KEY_PEM` = new PS256 secret B; `UMAXICA_JUMP_PRIVATE_KEY_KID` =
  old `cloudflare-active-2026-09-12-871e7273`; `UMAXICA_JUMP_PUBLIC_JWKS` = old EC/ES384 key only.
  The updated `wrangler.jsonc` vars had not been uploaded.
- Observed (Workers Observability logs and the owner's browser):
  - `GET /.well-known/jwks.json` returns 503 (the browser showed a connection error page): Jump
    fails closed when the private key and the active public key do not form a pair.
  - `GET /` with a token returned 400, `jump_reject`, `reason=invalid_signature`.
  - `GET /health` returned OK (it does not use key material).
- Conclusion: with a mismatched key Jump stops serving signed output instead of signing with the
  wrong key.

To restore service: deploy one version with the PS256 code (owner's other machine) and the updated
vars (`UMAXICA_JUMP_PRIVATE_KEY_KID` = `jump-prod-2026-11-12-ps256-f3b40484`, the PS256 public JWKS
in `wrangler.jsonc`); the secret carries over. Rollback target if needed:
`0d0f9206-f1b1-428d-b1ee-fdf085c55479` (uses the old ES384 key A, whose local copies were deleted).

## Lesson (owner, 2026-11-12)

Jump was not closed before the key change; it should have been. The runbook now has a pre-launch
procedure (`docs/operations/key-rotation.md`, "Pre-launch rotation: close, replace, verify,
reopen"): close with a Cloudflare Access application, add the private key, set the public values,
deploy one consistent version, verify on Cloudflare through Access, then reopen. Follow-up idea
under discussion: upload the private key, key ID and public JWKS together as Worker secrets in one
step (`wrangler versions secret bulk`) so they cannot drift apart.

## Update after merging the PS256 code (2026-11-12)

The owner's PS256 code (commits `80667ca`, `0eb2959`) reads `UMAXICA_JUMP_PRIVATE_KEY_KID` and
`UMAXICA_JUMP_PUBLIC_JWKS` as secrets, not `wrangler.jsonc` vars, and removed those vars. The local
`wrangler.jsonc` edit described above was dropped in favour of that code. For the next deploy, add
both values for key B (`jump-prod-2026-11-12-ps256-f3b40484`; B's public JWK is in cold storage as
`public-jwks.json`) as secrets to the same version as the private key, following the pre-launch
procedure in `docs/operations/key-rotation.md`.
