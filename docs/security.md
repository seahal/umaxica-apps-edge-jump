# Security contract

The exact [protocol graph](protocol.md) is the authorization boundary. Registry
construction rejects duplicate node/origin/edge, unknown references, self loops,
TLD crossings and noncanonical origins. Runtime still refuses self and Jump
links even with an incorrectly permissive fixture. Prototype keys do not register
issuers. Jump is internal-only: `dst` must be `internal` (ADR 0007).

Every compact JWT is limited to 4096 characters, checked before decoding, with
three Base64URL segments and a 128-character ES384 signature. The protected
header holds exactly `alg`, `kid` and `typ`: `alg` is fixed to ES384 and never
read from the token, `kid` is 1–128 characters with no C0/DEL/C1 control
character and is compared exactly, and `typ` must equal the deployment's value
(`JWT` in production, `jump-request+jwt` in staging). Any other member — `crit`,
`jku`, `jwk`, `x5u`, `x5c`, `cty`, `b64`, `zip` or an unknown name — is refused
before any fetch. The claim set is closed (schema, rpl, iss, aud, sub, iat, nbf,
exp, jti, dst, url); NumericDates are positive integers no later than 2100,
`jti` is 1–128 printable ASCII characters, `url` 1–2048 characters without
control characters. Input TTL ≤30s, skew 5s, output TTL 30s; structural TTL has
no skew allowance. Unverified decode only selects a registered issuer; no token
value builds a network destination and no authorization precedes signature.

Issuer JWKS come only from the registry URL, fetched with `cache: no-store`,
`redirect: manual` and no credentials, inside the 1000 ms request deadline.
Only status 200 with `application/jwk-set+json` or `application/json` (optional
`charset=utf-8`) is usable; 5xx/429 and network errors are temporary outages,
everything else is an unusable document. The body is streamed and abandoned at
64 KiB of decoded bytes regardless of `Content-Length`. A set holds 1–4 keys,
each `kty: EC`, `crv: P-384`, `alg: ES384`, `use: sig`, a valid unique `kid` and
coordinates that import as a P-384 point; private or symmetric members, a
duplicate `kid` or any nonconforming key refuse the whole set. Only `kty`, `crv`,
`x` and `y` reach the importer, so URL-bearing members are never dereferenced.

HTTPS URLs use WHATWG parsing. Userinfo, private/loopback/link-local/metadata
hosts, ambiguous control/backslash/percent encodings, trailing-dot hosts and
nonstandard ports are refused. Internal targets additionally reject fragments,
existing rt/rt[...] and duplicate single-valued redirect_uri/state/nonce/code/
next/return_to. Valid OAuth values are preserved; external query semantics are
not rewritten under internal rules. Claim URL and Location share query
serialization; this preserves meaning, not unprocessed input bytes. Oversized
output RT is rejected rather than truncated.

[Receiver responsibilities](receiver-contract.md) remain mandatory. All responses
are no-store, no-referrer, cookie-free, CSP/frame/nosniff protected, HSTS
max-age=31536000; includeSubDomains; preload. HEAD performs validation and
suppresses the body. Final adapter errors cover initialization, limiter, assets,
secrets and handler failures, with one entry ID and 1000ms deadline. Late work
cannot change the returned error into a redirect or log success.

`/?rt=` is a top-level document navigation endpoint: `GET` only (`HEAD` and
other methods are 405) and the raw query exactly `?rt=<compact JWS>`, so
percent-encoded keys, `+`, `;`, `rt[]`, repeated or additional parameters never
reach a query parser. It applies a Fetch Metadata check as defense in depth, not
authentication or authorization. A request with no `Sec-Fetch-*` header at all
(non-browser clients, older browsers) is accepted for compatibility and proves
nothing. Once any `Sec-Fetch-*` header is present, `Sec-Fetch-Site` must be
`cross-site`, `same-site`, `same-origin` or `none`, `Sec-Fetch-Mode` exactly
`navigate`, `Sec-Fetch-Dest` exactly `document`, and `Sec-Fetch-User` absent or
`?1`; partial, unknown, case-variant or malformed metadata fails closed.
`Sec-Fetch-User` is not required: redirect- and script-initiated navigations are
the normal path. Any `Sec-Purpose` value (prefetch, `prefetch;prerender`, or an
unknown value), Turbo's `X-Sec-Purpose`, and legacy `Purpose`/`X-Purpose`/`X-Moz`
are refused, because none is sent for a real navigation. The check runs after
method/query/origin validation and the rate limiter and before any token
decoding, JWKS fetch or signing. The response is the coarse 400
`invalid_request` with no Location; the log carries only the internal reason
`non_navigation_request`. Other routes are outside the policy. Node's built-in
`fetch` always sends `Sec-Fetch-Mode: cors` (and nothing else), which is partial
metadata and is therefore refused on `/?rt=` like a browser `fetch()`.

Rate limiting uses only the Cloudflare Workers native binding
(`wrangler.jsonc` `ratelimits`, keyed on CF-Connecting-IP). It is coarse abuse
control, not an authentication, authorization or replay boundary; shared IPs
can be limited together. No readiness endpoint is exposed.

Canonical key bindings are required; private-only or alias-only bundles fail 503. Public keysets reject private fields rather than stripping them. The
active pair is probe checked; import validity of other keys is a distinct check.
extractable:false restricts CryptoKey export, not absolute PEM/memory leakage.
