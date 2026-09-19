# OWASP ASVS / NIST implementation review of Jump

Date: 2026-09-19. Scope: `src/`, `wrangler.jsonc`, `public/_headers`,
`.github/workflows/integration.yaml` at branch `develop`, HEAD 1875ad3
(clean tree). Manual read-through plus three local checks. Supersedes
nothing; complements `2026-09-19-owasp-asvs-review.md`, whose findings 1
(error-code disclosure) and 5 (private-range denylist gaps) are now
fixed in the tree.

## Checks actually run

- `pnpm audit` — "No known vulnerabilities found".
- `pnpm run test` — 179 tests, 3 files, all passed.
- CSP hash recomputed: `printf '%s' 'history.replaceState(null,"",location.pathname)'
| openssl dgst -sha256 -binary | openssl base64` =
  `8A+3er73YJf04rRHGhbZwZQACPiiipi9EPduIeAAIDk=`, matching
  `CUSHION_INLINE_SCRIPT_SHA256` in `src/core/security_headers.ts:5`.
- Throwaway `tsx` probe against `createApp` with a `fetchJwks` that throws
  `jwks_unavailable`: `rt` carrying `iss=https://auth.umaxica.app`
  answered `503 service_unavailable`; `iss=https://evil.example.com`
  answered `400 invalid_request`. Same probe confirmed the Hono request
  log emits `<-- GET /` with the query string dropped, and that
  `/health.json` carries the full CSP. Probe file was deleted after use.

No dynamic scanning, no deployed-environment testing, no Fastly runtime
verification was performed.

## Findings

1. Medium — signing key imported as extractable. `src/cloudflare.ts:302`
   calls `importPKCS8(pem, 'ES384', { extractable: true })`
   unconditionally, and the resulting key lives in
   `CloudflareKeyMaterialCache` for 300 s. Extractability is only needed
   by the `exportJWK` fallback at `src/cloudflare.ts:312`, which runs
   only when no public JWKS is configured — and production configures
   `UMAXICA_JUMP_PUBLIC_JWKS` in `wrangler.jsonc`. ASVS V6 key
   management / NIST SP 800-57 key protection: import non-extractable on
   the configured-JWKS path.

2. Medium — rate-limit coverage. `checkRateLimit`
   (`src/cloudflare.ts:137`) applies only on Cloudflare, only for
   `pathname === '/'`, and fails open both on a missing
   `CF-Connecting-IP` and on a limiter fault (both logged, both
   deliberate). `/about`, `/health*`, `/.well-known/jwks.json`,
   `/sitemap.xml` are unauthenticated and unlimited; the JWKS route is
   cheap because key material is cached 300 s. `src/fastly.ts` has no
   equivalent control at all. NIST SC-5.

3. Medium — Fastly production path incomplete. `src/fastly.ts` passes
   neither `signerForRequest` nor `jumpJwks` while declaring
   `production: true`, so internal jumps and `/.well-known/jwks.json`
   answer 503 `service_unavailable`. Availability, already marked
   UNVERIFIED in the source comment.

4. Low — issuer-registration oracle. Public error mapping
   (`src/core/public_error.ts`) coarsens client-denied codes to
   `400 invalid_request` but keeps JWKS failures at
   `503 service_unavailable`. While an issuer's JWKS endpoint is
   unreachable, an unauthenticated caller can therefore distinguish a
   registered `iss` from an unregistered one, as the probe above shows.
   Conditional on an upstream outage. ASVS V7.4.1.

5. Low — health disclosure. `/health`, `/health.json`, `/health.html`
   are unauthenticated and return the edge name and the Cloudflare
   deployment revision id (`healthJson`, `src/core/health.ts:5`;
   `cloudflareRevision`, `src/cloudflare.ts:127`). ASVS 14.3.3.

6. Low — permissive defaults in `createApp`. With no options,
   `src/index.ts:50-58` falls back to the example registry
   (`https://app.example.com`, `allowed_dst_external:
['https://external.example']`) and the example JWKS. Both production
   entrypoints pass explicit configuration, so this is not reachable in
   deployment; a fail-closed default when `runtime.production` is true
   would remove the class.

7. Low — no CSP violation reporting. The policy in
   `src/core/security_headers.ts` sets no `report-to` / `report-uri`,
   so blocked-resource attempts are not observable. NIST SI-4.

8. Low — `public/_headers` is weaker than the Worker path. It carries
   five headers; the Worker path applies the full
   `STANDALONE_HTML_SECURITY_HEADERS` set (CSP, COOP/COEP/CORP,
   Permissions-Policy, `Cache-Control: no-store`). It only takes effect
   if assets are ever served without `run_worker_first`, but as written
   it is a weaker fallback rather than a mirror of the same contract.

9. Low — build-pipeline integrity. `.github/workflows/integration.yaml`
   pins actions by moving tag (`actions/checkout@v5`,
   `pnpm/action-setup@v4`, `actions/setup-node@v4`) rather than commit
   SHA (OWASP A08). The same file pins pnpm `10.29.3` while
   `package.json` declares `engines.pnpm: 12.0.0` with
   `engine-strict=true` in `.npmrc` — a mismatch that undermines the
   reproducibility the lockfile install is there to provide. Workflow
   `permissions: contents: read` is correctly minimal.

10. Informational — replay within `exp`. No replay state is held; a
    captured `rt` stays usable up to 300 s. Argued in
    `docs/security.md#replay-detection` and `docs/threat-model.md`, and
    the receiving application is required to enforce one-time use.
    Recorded as confirmed present, not as a defect.

## Re-verified as correct

JWT header pinning and `crit`/`jku`/`jwk`/`x5u` rejection; local
re-assertion of `iss`/`aud`/`sub`/`schema`/time claims with a 300 s TTL
cap; `jwks_uri` pinned to the issuer origin with `redirect: 'manual'`,
content-type check and 64 KiB streaming cap; wholesale rejection of
keysets with private JWK fields or duplicate `kid`; revoked-kid check
ahead of any cache lookup; forced-refresh cooldown and capped negative
cache bounding upstream amplification; `Object.hasOwn` registry lookup;
registry validation at construction; origin-exact issuer-scoped
destination policy over a normalized URL that rejects dangerous schemes,
userinfo, self-links and special-use addresses including IPv4-mapped,
IPv4-compatible, 6to4 and NAT64 forms; `default-src 'none'` CSP with a
hash-pinned single inline script; hono/jsx escaping with `raw()` used
only for that constant; request-log redaction to pathname; disabled
Cloudflare invocation logs; sign-then-verify pair check and rejection of
dev/staging/test kids before any outbound signature.
