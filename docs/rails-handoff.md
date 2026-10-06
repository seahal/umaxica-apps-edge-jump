# Rails owner handoff (issuers and receivers)

As of 2026-10-07, after the Worker-local hardening recorded in
`evidence/2026-10-07-worker-local-hardening.md`. That work is uncommitted and
not deployed. This document requests work in the Rails repository; it changes
nothing there and claims nothing about Rails code, which was not inspected.
Jump's own contract is in [security](security.md), [architecture](architecture.md)
and [receiver obligations](receiver-contract.md).

## A. Check before the Jump change is deployed

### 1. Every hop to Jump is a top-level navigation

`/?rt=` now answers 400 `invalid_request` to browser requests that are not a
top-level document navigation: `fetch`/XHR, iframes, prefetch and prerender.
Requests without Fetch Metadata headers are unaffected.

- Find every place that sends a browser to `https://jump.umaxica.net/?rt=…`.
  A plain link, a full-page form submission or a 302 from a full-page request
  is fine, cross-site included.
- A redirect to Jump that is followed inside a Turbo `fetch` (for example the
  response to a Turbo form submission) is not a navigation. Opt those out, for
  example with `data-turbo="false"`.
- Exclude Jump URLs from Speculation Rules and `<link rel="prefetch">`.
- Server-side Ruby HTTP clients send no `Sec-Fetch-*` headers and are not
  affected. Node's built-in `fetch` always sends `Sec-Fetch-Mode: cors` and is
  refused; check any monitoring that calls `/?rt=` that way.

### 2. Key rotation order

Publish a new `kid` in `/.well-known/jwks.json` before signing with it. A token
whose `kid` is not yet published makes Jump refuse that `kid` for 30 seconds,
and forced refreshes are limited to one per 10 seconds per issuer.

### 3. JWKS endpoint failure responses

- Temporary failure: answer 5xx or 429. Jump treats that as retryable (503
  `temporarily_unavailable`) and keeps verifying with keys fetched in the last
  30 seconds. It never uses keys older than that.
- A 200 with invalid JSON, a non-JSON `Content-Type`, a redirect or a body over
  64 KiB is an unusable document, not an outage; requests that need a refresh
  then get 400.
- Keys Jump uses: `kty: EC`, `crv: P-384`, `alg: ES384`, `use: sig` or absent,
  `kid` of 1–128 characters. A duplicate `kid` or any private field rejects the
  whole set.

## B. Coordinated blockers

### 4. URL parser differential

Jump compares URLs with WHATWG URL/URLSearchParams; the receiver reportedly uses
Rack nested-query semantics. Run the matrix in
[compatibility](compatibility.md#coordinated-blockers-not-changeable-from-jump-alone)
in the Rails runtime against URLs produced by Jump: semicolons, duplicate
parameters, `rt` / `rt[]` / `rt[x]`, nested keys, `%20` vs `+`, `%2B`,
percent-encoded keys, slash and backslash, and ordering. The receiver must
require exactly one literal `rt` and must not collapse array or nested forms
into it. Report which cases differ; Jump will not change its parsing or reject
characters such as `;` on its own.

### 5. Explicit typing

`typ: JWT` is not effective explicit typing under the JWT BCP (RFC 8725 §3.11,
draft-ietf-oauth-rfc8725bis-10). Moving to a dedicated `typ` is a schema
migration across issuers, Jump and receivers. Needed first: agreement on the
type name and on a window in which both values are accepted. No work is
requested before that.

## C. Confirm

6. Issued tokens have `exp - iat` ≤ 30 seconds. Jump rejects longer ones with no
   clock allowance; production issuance has not been verified from this side.
7. Receivers enforce replay protection on `jti`. Jump is stateless
   (`rpl: reuse`) and does not.

## D. Suggestion

8. Refuse prefetch and prerender (`Sec-Purpose` carrying the token `prefetch`)
   on the receiver endpoint that consumes `?rt=`, so a speculative load cannot
   spend the token before the real navigation.

## Reply needed

For each of 1–3, 6 and 7: confirmed, or what differs. For 4: the per-case
result. For 5: a proposed type name and migration window.
