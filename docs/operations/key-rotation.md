# Cloudflare Jump Signing-Key Rotation

## Scope

This runbook rotates the outbound ES384 key used by the Cloudflare Jump Worker.
The private key is a Cloudflare Worker secret named
`UMAXICA_JUMP_PRIVATE_KEY_PEM`. The matching public JWKS and active `kid` are
non-secret variables in `wrangler.jsonc`.

An operational key is one indivisible set:

- one PKCS#8 P-384 private key;
- one unique `kid`;
- one public P-384 JWK derived from that private key.

Never update only one member of this set. A matching `kid` does not prove that
the private and public keys match.

## Generate And Verify A New Set

Create a new private directory outside the repository. The generator refuses an
existing directory, writes secret files with mode `0600`, and performs a
sign/verify self-check before reporting success.

```sh
rotation_dir="$(mktemp -d)"
rmdir "$rotation_dir"
pnpm run keys:generate -- "$rotation_dir"
```

The command prints paths and the generated `kid`, but never key material. It
creates:

- `private.pem`: the PKCS#8 private key;
- `public-jwks.json`: the public JWKS safe to review and commit;
- `wrangler-secrets.json`: a temporary upload file containing the private key.

Copy the generated `kid` to `UMAXICA_JUMP_PRIVATE_KEY_KID` and the compact
contents of `public-jwks.json` to `UMAXICA_JUMP_PUBLIC_JWKS` in
`wrangler.jsonc`. Do not commit either secret file.

## Validate Before Upload

Run all repository checks and a Worker dry run:

```sh
pnpm install --frozen-lockfile
pnpm run format:check
pnpm run lint:check
pnpm run typecheck
pnpm run test
pnpm run cloudflare:check
```

Review the diff. It must contain the new public JWK and `kid`, and must not
contain `PRIVATE KEY` or `wrangler-secrets.json`.

## Atomic Upload And Deployment

Authenticate Wrangler first. Upload the code, variables, and new Worker secret
as one version. Do not use `wrangler secret put` for this rotation: it changes
the secret separately and can create the exact private/public mismatch this
runbook is intended to prevent.

```sh
pnpm exec wrangler whoami
pnpm exec wrangler versions upload \
  --strict \
  --tag "$kid" \
  --message "Rotate Jump signing key to $kid" \
  --secrets-file "$rotation_dir/wrangler-secrets.json"
pnpm exec wrangler versions deploy "<uploaded-version-id>@100%" --yes \
  --message "Activate Jump signing key $kid"
```

`versions upload --secrets-file` adds the Worker secret to the same immutable
version as the checked-in public variables. Deploy only the version ID returned
by that upload.

## Production Verification

After deployment:

1. `/.well-known/jwks.json` contains exactly the expected active `kid` and
   public key.
2. `/health.json` is healthy. This alone does not exercise signing.
3. A fresh valid inbound `rt` redirects successfully.
4. Logs for that request contain `jump_signer_configured` with the new `kid` and
   do not contain `jump_signer_pair_check_failed` or `signer_unavailable`.
5. The destination verifies the newly issued Jump JWT with the published JWK.

If any check fails, redeploy the previous Worker version as a unit. Do not copy
individual old secret or variable values into the new version.

After successful verification, securely delete the generated directory. This
removes the only local copy of the private key and cannot be undone.

## Incident Meaning

- `jump_signer_pair_check_failed` / `JWSSignatureVerificationFailed`: the
  configured private key and public JWK are different key pairs.
- `kid_not_in_public_jwks`: the configured `kid` is absent from the public JWKS.
- `pkcs8_import_failed`: the secret is missing, malformed, or not an ES384
  PKCS#8 private key.
- `jump_signer_configured`: import and cryptographic pair verification passed.

## Issuer Keys Are Separate

The keys fetched from issuer JWKS endpoints verify inbound `rt` tokens. They
are not this Worker signing key and are not rotated by this procedure. Issuer
rotation may retain old public keys for `maximum token TTL + leeway`; the Jump
outbound key set above is switched atomically.

Jump normally caches each issuer JWKS for 30 seconds. An unknown `kid` triggers
one immediate refresh without waiting for that TTL; concurrent refreshes are
coalesced, and repeated forced refreshes are rate-limited by a cooldown.

## Secret-Handling Rules

- Never commit, print, paste, screenshot, or attach private key material.
- Never place the private key in `wrangler.jsonc` or a shell argument.
- Public JWKs and `kid` values are intentionally public and may be committed.
- Use pnpm scripts and `pnpm exec wrangler` only.
