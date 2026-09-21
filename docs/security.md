# Security

## Purpose

Jump reduces redirect risk by verifying signed redirect requests at a dedicated FQDN boundary. It is not a confidentiality layer.

## NON-GOALS

- This project is NOT an authentication provider.
- This project is NOT a session manager.
- This project is NOT a generic proxy.
- This project is NOT a URL shortener.
- This project is NOT a confidential transport.
- This project does NOT hide redirect destinations.
- This project does NOT replace OAuth/OIDC.
- This project is ONLY a redirect trust broker across FQDN boundaries.

## Self-Referential Redirects

A Jump destination must never equal its source, and must never be Jump itself. A
same-origin hop achieves nothing a local navigation could not, and it is the
primitive a redirect loop is built from: an application that mints a new token
on arriving at itself will do so on every iteration, producing a chain of fully
valid, correctly signed requests that the verification path cannot distinguish
from legitimate traffic and that ends in a browser redirect limit rather than a
service alarm.

No issuer lists its own origin as an allowed destination, so the route does not
exist to be taken. Independently, a destination equal to the service origin is
rejected as `invalid_url` during URL normalization, which also prevents a Jump
request from being nested inside another. Jump is stateless and sees one hop at
a time, so it cannot detect a longer cycle such as `base -> core -> base`;
avoiding those remains the responsibility of the applications that mint tokens.
See [ADR 0003](../adr/0003-no-self-referential-redirects.md).

## OpenRedirect Risk

OpenRedirect bugs let attackers create trusted-looking links that send users to attacker-controlled destinations. Jump mitigates this by requiring a valid issuer signature, fixed audience, claim validation, URL normalization, and issuer-scoped allowlists.

## Referer And URL Leakage

`rt` appears in the URL by design. It can leak through browser history, screenshots, bookmarks, chat previews, analytics, and infrastructure logs. Referrer policy is `no-referrer`, but that does not make URLs confidential.

## JWT Leakage

`rt` JWTs are NOT confidential. They should contain only routing claims, never secrets or personal data. Every token must include a random `jti` and an `exp`.

## Why jti Exists

`jti` identifies that JWT. It is not an authentication claim and does not imply single use. Schema 1 does not copy the input `jti` into the output token and does not add `src_jti`.

## Why exp Exists

`exp` bounds token lifetime. Production input tokens must have `exp - iat <= 300` seconds. Output redirect tokens have exactly `exp = iat + 30` seconds. The common clock tolerance is 5 seconds and is never added to these structural TTL limits.

## Replay Detection

Jump does not detect replay and holds no persistent or shared state. Schema 1 tokens are short-lived signed navigation instructions; the same token may be evaluated more than once until `exp`. Cloudflare and Fastly apply the same contract: signature, claims, issuer, audience, time, destination policy, public errors, security headers, and structured logs.

A Jump token MUST NOT by itself authorize authentication completion, authorization decisions, CSRF approval, destructive operations, purchases, state-changing actions, privilege changes, Step-Up completion, or other replay-sensitive side effects. One-time use, idempotency, and replay-sensitive defenses belong to the receiving application. See [ADR 0002](../adr/0002-security-review-rails-handshake.md).

## JWT Schema Version

JWT schema is independent from service version. Service `0.1.0` starts with `schema: 1`. Patch or minor service releases must not change JWT compatibility. Increase schema only when token compatibility changes.

## Issuer-Scoped Allowlists

Each issuer has its own internal and external destination policy. This prevents a valid issuer from becoming a confused deputy for every destination.

## External Cushion Pages

External redirects require a cushion page. The page escapes the URL, displays the punycode hostname, warns about non-ASCII hostnames, removes `?rt` with `history.replaceState`, and uses `rel="noopener noreferrer"`.

## Security Headers

Responses use CSP, `nosniff`, frame denial (`X-Frame-Options: DENY` and
`frame-ancestors 'none'`), `Referrer-Policy: no-referrer`, `X-XSS-Protection: 0`,
restrictive permissions policy, HSTS
(`max-age=31536000; includeSubDomains; preload`, 12 months), no-store, and
noindex headers. `Set-Cookie` is forbidden. The 12-month HSTS max-age is the
production contract; `63072000` was a stale Worker/test value and is not the
policy. Hostname-specific Cloudflare Response Header Transforms must not replace
`no-referrer` / `DENY` / `0` on `jump.umaxica.net`.

## Public Errors

Invalid tokens, unusable JWKS documents (`jwks_bad_gateway`), and destination
or policy rejections answer `invalid_request` / 400.

When a registered issuer's JWKS cannot be fetched — timeout, network failure,
or upstream 5xx/429 (`jwks_unavailable`) — Jump answers
`temporarily_unavailable` / 503 so clients can retry. The public body and
`X-Jump-Error` header omit the issuer, the JWKS URL, and the internal reason.
During an issuer outage this class is distinguishable from `invalid_request`;
that retry signal is intentional. Structured logs keep the internal code.

`service_unavailable` / 503 remains Jump's own missing signer configuration,
independent of any inbound token.

## Rate Limiting

On Cloudflare, the per-IP limiter meters every path the Worker serves,
including static assets and the discovery endpoints — all of them are
unauthenticated. It is coarse abuse control, not an authorization gate, so it
fails open (and logs) when `CF-Connecting-IP` is absent or the binding faults.

## Attack Surface

- Public `GET /?rt=<JWT>` entry point.
- Public `GET /.well-known/jwks.json` key discovery endpoint.
- Public health and informational HTML endpoints.
- Issuer registry configuration.
- Runtime secret stores holding private keys.
- Edge access logs and error logs.
- Cushion page rendering of external URLs.

Each surface is designed to expose public data only, except runtime private keys. Private keys must remain in runtime secrets and must never enter git, logs, screenshots, or example configs. The Cloudflare signer imports its private key as a non-extractable `CryptoKey` whenever a public keyset is configured, so the deployed Worker holds no key it is able to serialize. Health endpoints publish the service version only, never the deployment revision.

## Migration Strategy

Security-sensitive compatibility changes must use JWT schema migration rather than silent behavior changes. See [schema migration](operations/schema-migration.md).

## Operational Procedures

Key rotation, compromise response, and key state definitions live in [key rotation](operations/key-rotation.md). Logging requirements live in [logging](logging.md).

## Known Limitations

- Jump cannot prevent a user from copying a URL with `rt`.
- Jump cannot make URL-visible JWTs confidential.
- Jump does not detect replay; schema 1 permits reuse within the short validity window.
- External cushion pages reduce phishing risk but cannot eliminate it.
- Issuer key compromise requires operational rotation and revocation.
