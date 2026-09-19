# OWASP ASVS review of the Jump implementation

Date: 2026-09-19. Scope: `src/` at working tree on branch `feature`
(HEAD 8824196). Manual read-through against OWASP ASVS chapters for
input validation, cryptography/JWT, unintended data disclosure, SSRF,
and access control. No dynamic testing or scanning was performed.

## Verified as correct

- JWT header hardening (`src/core/verify_jwt.ts`): `alg` pinned to ES384
  via allowlist, `typ` pinned to `JWT`, `kid` required and length-capped,
  and `crit` / `jku` / `jwk` / `x5u` rejected outright. Compact form,
  three parts, strict base64url charset, and an 8 KiB token cap are all
  checked before any decode.
- Claim validation re-asserts `iss`, `aud`, `sub`, `schema`, and the
  `iat`/`nbf`/`exp` relationships locally in addition to jose's checks,
  with a 300 s inbound TTL cap and 5 s clock tolerance.
- JWKS retrieval (`src/core/fetch_jwks.ts`): `jwks_uri` is pinned to the
  registry issuer origin, https-only, no port/userinfo/query/fragment,
  fixed `/.well-known/jwks.json` path, `redirect: 'manual'`, JSON
  content-type check, 64 KiB streaming body cap. Keysets containing any
  private JWK field or a duplicate `kid` are rejected wholesale
  (`parseJwks`); non-conforming keys are dropped. Revoked kids are
  checked before any cache lookup (`src/core/jwks_cache.ts`).
- Registry lookup uses `Object.hasOwn` (`src/core/registry.ts`), so
  prototype keys such as `__proto__` cannot resolve to an issuer.
- `createApp` validates the registry at construction: exact origins,
  https in production, no userinfo/port/path.
- Destination policy is issuer-scoped and origin-exact
  (`src/core/policy.ts`); `normalizeUrl` rejects `javascript:`/`data:`/
  `file:`/`blob:`, userinfo, plaintext http in production, self-links,
  localhost, cloud metadata hosts, and RFC1918/loopback/link-local IPv4
  including IPv4-mapped, IPv4-compatible, and 6to4 IPv6 forms.
- CSP is `default-src 'none'` with `base-uri`, `form-action`, and
  `frame-ancestors` all `'none'`; the single inline script is pinned by
  hash. The published hash `8A+3er73YJf04rRHGhbZwZQACPiiipi9EPduIeAAIDk=`
  was recomputed from `CUSHION_INLINE_SCRIPT` and matches.
- HTML is produced through hono/jsx (`src/core/page.tsx`); the only
  `raw()` use is the constant inline script. Sitemap output is
  XML-escaped.
- Request logging redacts to pathname only and replaces JWT-shaped
  segments; Cloudflare invocation logs are disabled in `wrangler.jsonc`
  precisely because they would carry the `rt` query value.
- Cloudflare signer material is pair-checked (sign-then-verify probe)
  against the published JWKS before use, and kids matching
  dev/staging/test are refused in production.
- `pnpm run test`: 170 tests across 3 files pass.

## Findings

1. Error-code disclosure (ASVS "unintended information disclosure",
   low/medium). `handleJump` returns the internal `JumpError` code
   verbatim in `X-Jump-Error` (`src/core/handle_jump.ts:105`), whereas
   the app-level handler deliberately coarsens codes through
   `publicErrorCode` (`src/index.ts`). The redirect route therefore
   distinguishes `invalid_signature`, `invalid_claim`, `invalid_dst`,
   `invalid_url`, `expired`, and `replay` to an unauthenticated caller.
   Pre-signature codes reveal whether an `iss` is in the registry;
   post-signature codes would let a holder of one valid token map the
   destination allowlist. Not exploited; reported as an inconsistency
   between the two error paths.

2. Replay window (ASVS session/token reuse, accepted by design). Both
   production entrypoints install `NoopReplayCache`
   (`src/cloudflare.ts`, `src/index.ts` default), so a captured `rt` is
   replayable until `exp`, up to 300 s. This is documented and argued in
   `docs/threat-model.md` ("Token Replay") and in the `createApp`
   comment; recorded here as confirmed present, not as a defect.

3. Rate limiting is Cloudflare-only, path-`/`-only, and fails open on a
   missing `CF-Connecting-IP` or a limiter fault
   (`src/cloudflare.ts:checkRateLimit`). The Fastly entrypoint has no
   equivalent. Both fail-open branches are commented and logged; noted
   as coverage, not as a bug.

4. `src/fastly.ts` passes neither `signerForRequest` nor `jumpJwks`, so
   on Fastly with `production: true` internal jumps answer 503
   (`signer_unavailable`) and `/.well-known/jwks.json` answers 503.
   Availability/functional gap rather than a security weakness.

5. Private-range denylist gaps in `isForbiddenHost`
   (`src/core/normalize_url.ts`): 100.64.0.0/10, 192.0.0.0/24,
   198.18.0.0/15, 224.0.0.0/4, 255.255.255.255, and NAT64 64:ff9b::/96
   are not covered. Not reachable today — every destination must also
   match an issuer-scoped origin allowlist, and the shipped registry
   sets `allowed_dst_external: false` for every issuer — so this is a
   defense-in-depth and registry-validation gap only.

6. `/robots.txt` and `/sitemap.xml` derive their origin from the request
   URL, i.e. from the Host header. On Cloudflare the custom-domain route
   pins Host; elsewhere it does not. Output is text/XML-escaped and
   `Cache-Control: no-store`, so the impact is limited to a reflected
   hostname. Informational.

No evidence was found of missing authentication on the redirect
decision, of an algorithm-confusion or unverified-token path, of HTML
injection in any rendered page, or of an unallowlisted redirect target.
