# Jump security investigation (source + production)

Date: 2026-09-21. Scope: working tree on `develop` (clean) and
`https://jump.umaxica.net`. Manual source review against `docs/security.md`,
`docs/threat-model.md`, ADR 0002, and the 2026-09-19 evidence set, plus
passive HTTP probes and local checks. No valid issuer tokens were minted,
no rate-limit exhaustion was attempted, and the Cloudflare dashboard was
not opened. Fastly production remains UNVERIFIED.

## Checks actually run

- `pnpm audit` — "No known vulnerabilities found".
- `pnpm run test` — 185 tests, 4 files, all passed.
- CSP hash recomputed from `CUSHION_INLINE_SCRIPT`:
  `printf '%s' 'history.replaceState(null,"",location.pathname)' | openssl dgst -sha256 -binary | openssl base64`
  = `8A+3er73YJf04rRHGhbZwZQACPiiipi9EPduIeAAIDk=`, matching
  `src/core/security_headers.ts` and the live `Content-Security-Policy`.
- `git ls-files | grep -Ei '\.(pem|key|env|secret|cert)$'` — empty.
- Live `curl` against `https://jump.umaxica.net` (User-Agent
  `umaxica-jump-security-review/1.0`): `/`, `/about`, `/health`,
  `/health.json`, `/robots.txt`, `/sitemap.xml`, `/.well-known/jwks.json`,
  `/favicon.ico`, `/no-such`, `/?rt=not-a-jwt`, extra query, `POST /`,
  `OPTIONS /`, `TRACE /`, `//?rt=aaa.bbb.ccc`, spoofed `Host`, HTTP
  cleartext, `/?rt=<script>…`, and `GET /cdn-cgi/trace`.
- Issuer JWKS/origin GETs: `www`/`auth` on `umaxica.app` / `.com` / `.org`.
- Cloudflare traces attribute list retrieved from
  `https://developers.cloudflare.com/workers/observability/traces/spans-and-attributes/`
  (updated 2026-09-17).

## Verified as correct (source)

JWT header pinning (ES384, `typ=JWT`, `crit`/`jku`/`jwk`/`x5u` rejected,
8 KiB cap); claim re-assertion with 300 s inbound TTL and 5 s skew;
issuer-origin JWKS fetch with `redirect: 'manual'`, JSON content-type,
64 KiB cap; private-JWK-field and duplicate-kid rejection; `Object.hasOwn`
registry lookup; origin-exact issuer-scoped policy; production registry
`allowed_dst_external: false` for every issuer; special-use IP denylist
including CGNAT, 192.0.0.0/24, 198.18.0.0/15, multicast, NAT64; public
errors coarsened to `invalid_request` including JWKS failures; no
`X-Jump-Error` internal codes; robots/sitemap use `config.serviceOrigin`;
signing key `extractable: false` when public JWKS is configured; health
publishes service version only; `workers_dev: false`; invocation logs
disabled in `wrangler.jsonc`; `Set-Cookie` stripped; no Durable Object
replay path.

## Production observations

Worker is live (`health.json` `edge=cloudflare`, `version=0.1.0`,
`kid=cloudflare-active-2026-09-12-871e7273`, no private JWK fields).
`GET /` 302 `/about`. Invalid `rt` and unknown query 400
`X-Jump-Error: invalid_request` without reflecting the token.
`POST`/`OPTIONS` 405. `TRACE` 405 at the edge. Spoofed `Host` 403 at
Cloudflare. `workers.dev` hostname does not resolve. HTTP 301 to HTTPS.
`//?rt=…` answers 400, not a 301 that echoes the token. robots/sitemap
cite `https://jump.umaxica.net`.

Zone-level headers differ from the Worker contract
(`src/core/security_headers.ts` / `test/jump.test.ts`
`expectSecurityHeaders`):

| Header                            | Worker / tests | Live `jump.umaxica.net` |
| --------------------------------- | -------------- | ----------------------- |
| Referrer-Policy                   | `no-referrer`  | `same-origin`           |
| X-Frame-Options                   | `DENY`         | `SAMEORIGIN`            |
| X-XSS-Protection                  | `0`            | `1; mode=block`         |
| Strict-Transport-Security max-age | `63072000`     | `31536000`              |

CSP, COOP/COEP/CORP, Permissions-Policy, `Cache-Control: no-store`,
and `X-Robots-Tag` still match the Worker. CSP `frame-ancestors 'none'`
still denies framing in modern browsers. Cross-origin navigations still
omit Referer under `same-origin`. The mismatch is zone overlay, not a
Worker regression: local unit/e2e still assert the stricter set.

HTML 400 bodies included a Cloudflare challenge-platform inline script
and hidden iframe (`/cdn-cgi/challenge-platform/scripts/jsd/main.js`).
That script is not in this repository. Browser CSP (`script-src` hash
only, `default-src 'none'`) should block it; it is still injected into
the bytes.

`GET /cdn-cgi/trace` is reachable and returns colo, client IP, TLS, and
User-Agent. This is Cloudflare's default debug endpoint, not Jump code.

`wrangler.jsonc` sets `observability.traces.enabled: true`,
`head_sampling_rate: 1`, `persist: true`. Cloudflare documents Fetch
Handler spans as including `url.full` and `user_agent.original`.
Dashboard contents were not inspected (UNVERIFIED), but the config plus
the published attribute list contradict `docs/logging.md` (no `rt` in
access logs; do not log User-Agent). Invocation logs were correctly
left off.

Issuer origins `https://www.umaxica.app/`, `https://auth.umaxica.app/`,
`https://www.umaxica.com/`, and their `/.well-known/jwks.json` answered
`502` with body `error code: 502` at the time of the probe. Jump cannot
verify a live inbound token while those JWKS endpoints are down. Public
mapping keeps that failure in `400 invalid_request`.

## Findings

1. Medium — Workers traces persist full request URLs. Config enables
   100% sampled, persisted traces. Platform docs list `url.full` on the
   fetch handler. That is the same class of `rt` leakage that caused
   `invocation_logs: false`. Confirm in the dashboard and disable,
   sample, or strip query attributes.

2. Medium — production security-header overlay. Live Referrer-Policy,
   X-Frame-Options, X-XSS-Protection, and HSTS max-age do not match the
   Worker. Likely umaxica.net managed transforms / zone headers. CSP
   still holds the stronger frame and script policy.

3. Low — Cloudflare HTML rewriting on error pages injects a JS
   detection iframe/script that the published CSP forbids. No
   user-controlled reflection was observed.

4. Low — `/cdn-cgi/trace` is public. Disable via Cloudflare if not
   required.

5. Low — issuer JWKS/origins 502. Operational outage of the handshake,
   not an authorization bypass. JWKS fetch failures are not negatively
   cached (`JwksCache.fetchAndCache` only stores successes), so a
   well-formed token with a registered `iss` retries upstream per
   isolate until the 1 s deadline, bounded by the 600/60s per-IP
   limiter.

6. Informational — schema-1 reuse within `exp` remains accepted (ADR
   0002). Fastly entrypoint still has no signer/JWKS (UNVERIFIED, 503
   on internal jump / JWKS). Rate limiter still fails open. `SECURITY.md`
   is still the GitHub template. Timing of JWKS fetch vs immediate
   `invalid_claim` can still distinguish a registered `iss`.

No evidence was found of an unauthenticated open redirect, algorithm
confusion, HTML injection of `rt`, Host-reflected robots/sitemap,
workers.dev exposure, committed private keys, or internal error-code
disclosure on the live Worker path.
