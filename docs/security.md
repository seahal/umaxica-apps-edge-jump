# Security contract

The exact [protocol graph](protocol.md) is the authorization boundary. Registry
construction rejects duplicate node/origin/edge, unknown references, self loops,
TLD crossings and noncanonical origins. Runtime still refuses self and Jump
links even with an incorrectly permissive fixture. Prototype keys do not register
issuers. Production external policy is false for every issuer.

Every compact JWT is limited to 8192 characters; typ JWT, ES384, kid ≤128,
object header/payload, Base64URL, registered issuer, signature, exact string aud,
sub, schema/rpl, finite NumericDates, ordering and lifetime are required. Input
TTL ≤30s, skew 5s, output TTL30s. Structural TTL has no skew allowance. jku,
jwk, x5u and crit are refused before fetch. Unverified decode is used only for
shape checks and registered key lookup; no authorization precedes signature.

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

`/?rt=` is a top-level navigation endpoint and applies a Fetch Metadata check as
defense in depth. It is not authentication or authorization: missing headers
(non-browser clients) and values that the current standards do not define are
accepted unchanged, with no case folding or repair. A request is refused when
`Sec-Fetch-Mode` is a defined mode other than `navigate` (`cors`, `no-cors`,
`same-origin`, `websocket`, `webtransport`), when `Sec-Fetch-Dest` is a defined
destination other than `document` (`empty`, `iframe`, `frame`, `image`,
`script`, `style`, workers and the rest of the Fetch destination list), or when
`Sec-Purpose`, parsed as a structured-field list, carries the token `prefetch` —
which covers prerendering (`prefetch;prerender`), since mode and destination
cannot identify it. `Sec-Fetch-Site` and `Sec-Fetch-User` are never consulted:
cross-site and redirect- or script-initiated navigations are the normal path.
Legacy `Purpose`/`X-Purpose`/`X-Moz` are not consulted. The check runs after
method/query/origin validation and the rate limiter and before any token
decoding, JWKS fetch or signing. The response is the coarse 400
`invalid_request` with no Location; the log carries only the internal reason
`non_navigation_request`. Other routes are outside the policy. Node's built-in
`fetch` always sends `Sec-Fetch-Mode: cors` and is therefore refused on `/?rt=`
like a browser `fetch()`.

Rate limiting uses only the Cloudflare Workers native binding
(`wrangler.jsonc` `ratelimits`, keyed on CF-Connecting-IP). It is coarse abuse
control, not an authentication, authorization or replay boundary; shared IPs
can be limited together. No readiness endpoint is exposed.

Canonical key bindings are required; private-only or alias-only bundles fail 503. Public keysets reject private fields rather than stripping them. The
active pair is probe checked; import validity of other keys is a distinct check.
extractable:false restricts CryptoKey export, not absolute PEM/memory leakage.
