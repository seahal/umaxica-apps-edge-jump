# Production Configuration

## Current Registry Source

Production edge entry points use the checked-in Umaxica issuer registry in
`src/config/registry.umaxica.ts`.

This registry is not a secret. It defines which issuers are trusted, where their
JWKS documents are fetched from, and which normalized destination origins are
allowed.

## Allowed Issuers And Destinations

| Issuer                     | JWKS                                 | Allowed internal destination origins                                                                           | External |
| -------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------- | -------- |
| `https://auth.umaxica.app` | same origin `/.well-known/jwks.json` | `https://www.umaxica.app`                                                                                      | no       |
| `https://auth.umaxica.com` | same origin `/.well-known/jwks.json` | `https://www.umaxica.com`                                                                                      | no       |
| `https://auth.umaxica.org` | same origin `/.well-known/jwks.json` | `https://www.umaxica.org`                                                                                      | no       |
| `https://www.umaxica.app`  | same origin `/.well-known/jwks.json` | `https://auth.umaxica.app`, `https://www-jp.umaxica.app`, `https://jp.umaxica.app`, `https://palm.umaxica.app` | no       |
| `https://www.umaxica.com`  | same origin `/.well-known/jwks.json` | `https://auth.umaxica.com`, `https://www-jp.umaxica.com`, `https://jp.umaxica.com`                             | no       |
| `https://www.umaxica.org`  | same origin `/.well-known/jwks.json` | `https://auth.umaxica.org`, `https://www-jp.umaxica.org`, `https://jp.umaxica.org`, `https://edit.umaxica.org` | no       |

Roles are defined once in `src/config/registry.umaxica.ts` and expanded over
`app` / `com` / `org`, so the three TLDs cannot drift apart: `auth` = `auth.*`,
`base` = `www.*`, `side` = `www-jp.*`, `core` = `jp.*`, plus `edit.umaxica.org`
and `palm.umaxica.app`. Only `auth` and `base` are issuers, and `auth` may only
travel to and from `base` — `auth` <-> any other role is prohibited in both
directions, because a round trip from auth through anything but base widens the
redirect surface and makes post-incident reconstruction unreliable.

## Final Desired Shape

The long-term production shape is:

- DNS: `jump.umaxica.net` points to the selected edge runtime.
- TLS: certificate is issued and managed by the edge provider for
  `jump.umaxica.net`.
- Runtime: Cloudflare Workers is the production entry point. Fastly Compute is experimental, unverified, and outside the production scope of this hardening work.
- Private key: stored only as the Cloudflare Worker secret
  `UMAXICA_JUMP_PRIVATE_KEY_PEM`.
- Private key `kid`: stored in the provider secret backend or non-secret runtime
  config.
- Issuer registry: stored in a reviewed runtime configuration source or secret
  backend if operational policy requires central runtime updates.
- Logs: access logs omit the query entirely; audit fields follow `docs/logging.md` and are retained for 30 days.

## Cloudflare Workers

Cloudflare Workers is the first production target in this repository. Keep the
`jump.umaxica.net` contract aligned here before mirroring any runtime-specific
changes elsewhere.

`wrangler.jsonc` binds `jump.umaxica.net` as a custom domain. `JUMP_RATE_LIMITER`
is namespace `520900` (net/jump, Global), 600 requests per 60 seconds. Local
`pnpm run cloudflare:dev` listens on port `5209`. The private key is not
declared in that file: it is uploaded as the Worker secret
`UMAXICA_JUMP_PRIVATE_KEY_PEM`. The matching `kid` and public JWKS are ordinary
variables because they are not confidential.

Before production traffic:

1. Confirm the `jump.umaxica.net` DNS record is proxied by Cloudflare.
2. Confirm Cloudflare has issued an active certificate for `jump.umaxica.net`.
3. Store the ES384 P-384 private key as `UMAXICA_JUMP_PRIVATE_KEY_PEM`.
4. Put the matching active signing key id in
   `UMAXICA_JUMP_PRIVATE_KEY_KID`.
5. Put the public JWK derived from that private key in
   `UMAXICA_JUMP_PUBLIC_JWKS`.
6. Use the atomic version-upload procedure in `key-rotation.md`; do not update
   the three values independently.
7. Verify `/health.json`.
8. Verify a valid issuer token redirects only to the configured internal origin
   and emits `jump_signer_configured` for the expected `kid`.
9. Verify a token targeting an unlisted origin is rejected with `invalid_dst`.
10. Verify logs do not contain the full `rt` value.
11. Confirm `wrangler.jsonc` observability: `redact_query_string: true`,
    `logs.invocation_logs: false`, `traces.enabled: false`,
    `traces.persist: false`, and no log/trace destinations.
12. Confirm every production issuer and receiver uses
    `https://jump.umaxica.net` as its Jump base URL and that no production
    configuration refers to `leap.umaxica.net` or its JWKS
    ([ADR 0004](../../adr/0004-multiple-jump-implementations.md)).

## Cloudflare zone rules for `jump.umaxica.net`

These settings live on the `umaxica.net` zone, not in `wrangler.jsonc`. This
repository can read the zone id but cannot list or write Transform Rules,
Managed Transforms, or Configuration Rules with the current Wrangler OAuth
scopes (`zone` read only; rulesets return 403). Apply them in the dashboard
or with a token that can write zone rulesets. Do **not** turn off zone-wide
security-header transforms for other hostnames.

### Response Header Transform (narrowest overlay)

Create a Response Header Transform Rule whose expression is:

```txt
http.host eq "jump.umaxica.net"
```

Set (do not add duplicates if a later rule already sets them):

| Header           | Value         |
| ---------------- | ------------- |
| Referrer-Policy  | `no-referrer` |
| X-Frame-Options  | `DENY`        |
| X-XSS-Protection | `0`           |

Do **not** change `Strict-Transport-Security`. Production HSTS is
`max-age=31536000; includeSubDomains; preload` (12 months) and is the
intended contract.

Place this rule so it wins over zone-wide Managed Transforms / “Add security
headers” for this hostname only.

### Configuration Rule (skip HTML rewriting)

Create a Configuration Rule with the same hostname expression. For matching
requests:

- Email Obfuscation: off
- Rocket Loader: off
- Cloudflare Web Analytics / RUM: off
- Response Body Buffering: None

Jump is a redirect gateway, not an interactive site. Challenge-platform
script/iframe injection on HTML 400 pages is unnecessary here and conflicts
with `default-src 'none'`. This rule must not disable WAF or rate limiting,
and must not apply to other hostnames.

JavaScript Detections cannot always be turned off for Bot Fight Mode
accounts; Response Body Buffering `None` is the documented way to skip HTML
inspection on a narrow match. After deploy, `GET /?rt=not-a-jwt` must not
contain `/cdn-cgi/challenge-platform/`.

### `/cdn-cgi/trace`

Cloudflare documents `/cdn-cgi/` as a platform endpoint that cannot be
modified or customized. WAF attempts to block it have been reported as
unreliable and can interfere with challenge-platform paths. Leave it as
low-impact metadata exposure unless a later, proven hostname-specific block
is available. Not a release blocker.

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
