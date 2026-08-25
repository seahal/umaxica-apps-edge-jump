# Production Configuration

## Current Registry Source

Production edge entry points use the checked-in Umaxica issuer registry in
`src/config/registry.umaxica.ts`.

This registry is not a secret. It defines which issuers are trusted, where their
JWKS documents are fetched from, and which normalized destination origins are
allowed.

## Allowed Issuers And Destinations

| Issuer                     | JWKS                                 | Allowed internal destination origins                 | External |
| -------------------------- | ------------------------------------ | ---------------------------------------------------- | -------- |
| `https://auth.umaxica.app` | same origin `/.well-known/jwks.json` | `https://www.umaxica.app`                            | no       |
| `https://auth.umaxica.com` | same origin `/.well-known/jwks.json` | `https://www.umaxica.com`                            | no       |
| `https://auth.umaxica.org` | same origin `/.well-known/jwks.json` | `https://www.umaxica.org`                            | no       |
| `https://www.umaxica.app`  | same origin `/.well-known/jwks.json` | `https://auth.umaxica.app`, `https://jp.umaxica.app` | no       |
| `https://www.umaxica.com`  | same origin `/.well-known/jwks.json` | `https://auth.umaxica.com`, `https://jp.umaxica.com` | no       |
| `https://www.umaxica.org`  | same origin `/.well-known/jwks.json` | `https://auth.umaxica.org`, `https://jp.umaxica.org` | no       |

## Final Desired Shape

The long-term production shape is:

- DNS: `jump.umaxica.net` points to the selected edge runtime.
- TLS: certificate is issued and managed by the edge provider for
  `jump.umaxica.net`.
- Runtime: Cloudflare Workers is the production entry point. Fastly Compute is experimental, unverified, and outside the production scope of this hardening work.
- Private key: stored only in the provider secret backend.
- Private key `kid`: stored in the provider secret backend or non-secret runtime
  config.
- Issuer registry: stored in a reviewed runtime configuration source or secret
  backend if operational policy requires central runtime updates.
- Logs: access logs omit the query entirely; audit fields follow `docs/logging.md` and are retained for 30 days.

## Cloudflare Workers

Cloudflare Workers is the first production target in this repository. Keep the
`jump.umaxica.net` contract aligned here before mirroring any runtime-specific
changes elsewhere.

`wrangler.jsonc` already binds `jump.umaxica.net` as a custom domain and binds
`UMAXICA_JUMP_PRIVATE_KEY_PEM` from Secrets Store.

Before production traffic:

1. Confirm the `jump.umaxica.net` DNS record is proxied by Cloudflare.
2. Confirm Cloudflare has issued an active certificate for `jump.umaxica.net`.
3. Store the ES384 P-384 private key as `UMAXICA_JUMP_PRIVATE_KEY_PEM`.
4. Store the active signing key id as `UMAXICA_JUMP_PRIVATE_KEY_KID`.
5. Deploy the Worker.
6. Verify `/health.json`.
7. Verify a valid issuer token redirects only to the configured internal origin.
8. Verify a token targeting an unlisted origin is rejected with `invalid_dst`.
9. Verify logs do not contain the full `rt` value.

## Fastly Compute

Fastly is experimental, unverified, and not a production target. Its code, configuration, dependencies, and deployment procedure are intentionally unchanged by the Cloudflare hardening work.

## Registry Rotation

Registry changes are policy changes. Review them like code changes.

Normal update:

1. Add or update issuer entries in `src/config/registry.umaxica.ts`.
2. Ensure every `allowed_dst_internal` entry is an origin only. Paths, query
   strings, and fragments are rejected.
3. Keep `allowed_dst_external` as `false` unless external redirects are explicitly
   approved.
4. Deploy.
5. Verify an allowed token succeeds.
6. Verify an unlisted destination is rejected.

Compromise update:

1. Add the compromised `kid` to the issuer's `revoked_kids`.
2. Deploy immediately.
3. Verify tokens signed with the revoked `kid` fail with `invalid_signature`.
4. Rotate the issuer signing key and publish the new public JWK.

## Key Rotation

Use `docs/operations/key-rotation.md` for key generation and private-key
handling. Private keys must stay out of git, logs, screenshots, and example
configs.
