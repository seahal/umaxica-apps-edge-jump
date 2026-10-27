# Rails owner handoff (issuers and receivers)

As of 2026-10-07, after the strict stateless profile recorded in
`evidence/2026-10-07-jump-strict-hardening.md`. That work is committed on a
branch and **not deployed** anywhere. This document requests work in the Rails
repository; it changes nothing there and claims nothing about Rails code, which
was not inspected. Jump is not relaxed to make any of these pass: each item is
the contract Rails is asked to meet. Jump's own contract is in
[security](security.md), [protocol](protocol.md), [architecture](architecture.md)
and [receiver obligations](receiver-contract.md).

## 1. Every hop to Jump is a top-level GET navigation (Inertia/Turbo)

`/?rt=` answers 400 `invalid_request` to browser requests that are not a
coherent top-level document navigation, and 405 to `HEAD`.

- A plain link, a full-page `GET` form, a typed URL or a 302/303 from a
  full-page request is fine, cross-site included (verified in Chromium).
- `fetch`/XHR (`Sec-Fetch-Mode: cors`/`no-cors`, `Dest: empty`), iframes,
  `<link rel="prefetch">` (Chromium sends `Sec-Purpose: prefetch`) and Turbo
  prefetch (`X-Sec-Purpose: prefetch`) are refused. An Inertia or Turbo visit
  that follows a redirect to Jump inside `fetch` is therefore refused: use a
  full page load (Inertia `location` / `window.location`, `data-turbo="false"`).
- Exclude Jump URLs from Speculation Rules, `<link rel="prefetch">` and Turbo
  prefetch (`data-turbo-prefetch="false"`).
- Server-side clients that send no `Sec-Fetch-*` header are unaffected. Node's
  built-in `fetch` sends only `Sec-Fetch-Mode: cors` and is refused.

## 2. Explicit `typ` (staging first)

The staging Jump accepts only `typ: "jump-request+jwt"` from issuers and signs
`typ: "jump-return+jwt"` for receivers; the value is compared exactly (no case
folding, no `application/` prefix). Production stays on `typ: "JWT"` until this
migration is scheduled. Requested:

- Issuers: emit `jump-request+jwt` toward the staging Jump.
- Receivers: verify `typ` exactly — `jump-return+jwt` from staging, `JWT` from
  production — and reject anything else.
- A plan and window for the production cutover. Jump will not accept both values
  in one deployment.

## 3. Request token shape

- Protected header: exactly `alg: ES384`, `kid`, `typ`. Any other member is
  refused.
- Claims: exactly `schema` (1), `rpl` (`reuse`), `iss`, `aud` (string, Jump
  origin), `sub` (`jump-redirect`), `iat`, `nbf`, `exp`, `jti`, `dst`
  (`internal`), `url`. Extra claims are refused.
- `iat`/`nbf`/`exp` are integer seconds; fractional values are refused.
  `exp - iat` ≤ 30, no clock allowance.
- `jti`: 1–128 printable ASCII characters. `url`: at most 2048 characters.
- Compact token at most 4096 characters.

Confirm each, or report what differs.

## 4. Issuer JWKS endpoint and rotation

- Respond `200` with `Content-Type: application/jwk-set+json` or
  `application/json` (optionally `; charset=utf-8`). Any other type, parameter,
  status (including 204 and 3xx) or a body over 64 KiB is an unusable document;
  5xx and 429 are treated as temporary outages.
- Publish 1–4 keys, each `kty: EC`, `crv: P-384`, `alg: ES384`, `use: sig`,
  unique `kid` of 1–128 characters without control characters. A key that does
  not match (other algorithms, `use: enc`, absent `use`) refuses the whole set,
  so an issuer JWKS used for other purposes must be split.
- Prepublish a new `kid` more than 30 seconds (Jump's cache TTL) plus any HTTP
  cache lifetime before signing with it. A not-yet-cached `kid` costs one forced
  refresh, limited to one per 10 seconds per issuer; unknown kids inside that
  window are refused.
- **Intermediary cache.** Jump fetches with `cache: "no-store"`, which bypasses
  the Workers cache but not caches in front of the issuer. The reported
  `Cache-Control: public, max-age=3600` lets a CDN serve a keyset up to an hour
  old, so a forced refresh cannot guarantee freshness. Either send
  `Cache-Control: no-cache` (or `max-age` ≤ 30) on `/.well-known/jwks.json`, or
  make the rotation lead time exceed the CDN lifetime and purge on rotation.
  Not measured against the real issuer from this side.

## 5. Receiver speculative-load defense

Refuse prefetch and prerender (`Sec-Purpose` present, `X-Sec-Purpose`) on the
endpoint that consumes `?rt=`, so a speculative load cannot spend a one-time
receiver transaction before the real navigation.

## 6. Clock skew

No clock-skew failure was observed (no staging run against Rails was possible).
Jump keeps a 5-second allowance on current-time comparisons and none on the
30-second structural TTL.

## 7. Receiver return-token schema

Return tokens carry exactly `schema`, `rpl`, `iss`, `aud`, `sub`, `iat`, `nbf`,
`exp` (= `iat` + 30), `jti` (random UUID, fresh per evaluation), `src`, `dst`,
`url`, with header `alg`/`kid`/`typ`. Jump keeps no `jti` state (`rpl: reuse`):
receivers must enforce their own one-time transaction semantics.

- **Accept the 30-second lifetime.** Receivers must accept a correctly signed
  return token whose `exp - iat` is 30 seconds. A receiver maximum below that
  (10 seconds was reported) is incompatible, and Jump does not follow a
  receiver-local TTL setting. This is an open release blocker in ADR 0006.
- **One-time semantics are not `jti` deduplication.** Jump re-evaluates the same
  request token until it expires and mints a new `jti` each time, with no link
  to the request `jti`. Guard the receiver-owned transaction itself
  (authorization code, state, nonce); see ADR 0002 and
  [receiver obligations](receiver-contract.md).

## 8. URL differential

Jump now accepts the entry query only in the raw form `?rt=<JWS>`, so no
query-parser differential can affect which `rt` Jump reads. The receiver-side
differential in [compatibility](compatibility.md#coordinated-blockers-not-changeable-from-jump-alone)
(Rack nested-query vs WHATWG on Jump-produced URLs) remains open and must be run
in the Rails runtime. No new differential was found in Jump's own tests.

## Reply needed

For 1, 3, 4 and 7: confirmed, or what differs. For 2: an agreed migration
window. For 4: the JWKS `Cache-Control` decision. For 8: the per-case result.
