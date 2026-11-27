# Security contract

The exact [protocol graph](protocol.md) is the authorization boundary. Registry
construction rejects duplicate node/origin/edge, unknown references, self loops,
TLD crossings and noncanonical origins. Runtime still refuses self and Jump
links even with an incorrectly permissive fixture. Prototype keys do not register
issuers. Jump is internal-only: `dst` must be `internal` (ADR 0007).

Every compact JWT is limited to 4096 characters, checked before decoding, with
three Base64URL segments and a 512-character PS256 signature. The protected
header holds exactly `alg`, `kid` and `typ`: `alg` is fixed to PS256 and never
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
`redirect: manual` and no credentials, with an independent 1000 ms fetch deadline. Caller cancellation stops only
that caller’s wait and does not cancel the shared fetch.
Only status 200 with `application/jwk-set+json` or `application/json` (optional
`charset=utf-8`) is usable; 5xx/429 and network errors are temporary outages,
everything else is an unusable document. The body is streamed and abandoned at
64 KiB of decoded bytes regardless of `Content-Length`. The set may contain
up to 8 entries, all objects without private or symmetric key parameters.
Jump skips entries not labeled `alg: PS256` and requires 1–4 PS256 keys. Each
must have `kty: RSA`, `e: AQAB`, `use: sig`, a valid, unique `kid`, and a
3072-bit modulus. If present, `key_ops` must be exactly `["verify"]`. Any
invalid PS256 key rejects the whole set. Only `kty`, `n` and `e` reach the
importer, so URL-bearing members are never dereferenced.

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

Rate limiting runs as Hono middleware on dynamic requests after request, origin,
method and entry-query checks and before route handlers. It uses only the
Cloudflare Workers native binding (`wrangler.jsonc` `ratelimits`): IPv4 keys use
the address as supplied by Cloudflare, while IPv6 keys use its canonical `/64`
prefix. Static assets remain outside the Worker because `run_worker_first` is
false. This is coarse abuse control, not an authentication, authorization or
replay boundary; clients sharing an address or IPv6 `/64` can be limited
together. Binding-call exceptions follow ADR 0009 and fail open; missing or
invalid bindings and client addresses fail closed. No readiness endpoint is
exposed.

Canonical key bindings are required; private-only or alias-only bundles fail 503. Public keysets reject private fields rather than stripping them. The
active pair is probe checked; import validity of other keys is a distinct check.
extractable:false restricts CryptoKey export, not absolute PEM/memory leakage.

## URL exposure and accepted token reuse

The owner accepts reuse of valid inbound and outbound tokens because persistent
storage is unavailable ([ADR 0010](../adr/0010-accept-stateless-token-reuse.md),
supplementing ADR 0002). No replay store or mandatory one-time jti consumption
is required. A repeated inbound token produces a fresh outbound jti and a new
30-second outbound lifetime; a new jti does not prove a unique user action.
Operation-specific authentication, authorization, CSRF and OAuth checks remain
the receiver's responsibility. Jump cannot guarantee single execution.

Both inbound and outbound rt appear in URLs. A JWS is signed, not encrypted;
its destination URL and any embedded query values are readable. Issuers must
avoid embedding passwords, session/access/refresh tokens, private keys or
unnecessary personal data in destination URLs. OAuth parameters needed by the
existing flow still require endpoint-level protection. Logs, APM and error
trackers on issuers and receivers must redact rt and other sensitive query
values. Receivers must validate before rendering, then redirect to a clean URL
with no-store and no-referrer headers; token-bearing pages must not load
third-party scripts or resources. These are integration requirements, not
verified receiver implementation claims.

Jump already applies no-store, no-referrer and application log redaction;
Wrangler config enables platform query redaction. Live enforcement is an
operational verification. These mitigations cannot remove browser history or
copied URLs, and URL transport of sensitive values remains an ASVS 14.2.1
gap. Reuse acceptance does not close that gap. See
[receiver exposure guidance](receiver-rt-exposure-report.md).

## 0.4.0 candidate redirect defense

The [redirect policy](redirect-policy.md) adds raw/normalized direct pathname
checks, immutable origin/path denial and independent parsed-host transfer-query
restrictions after the existing issuer graph. Cryptographic, TTL, revocation,
metadata, rate-limit, logging and deadline defenses remain mandatory.
Deployment and receiver integration are not established by local tests.
