# Remediation of the OWASP/NIST review findings (Cloudflare only)

Date: 2026-09-19. Branch `develop`, on top of HEAD 1875ad3. Acts on
`2026-09-19-owasp-nist-implementation-review.md`. Fastly was excluded by
decision: it is not deployed yet, so finding 3 (missing signer/JWKS
bindings) and the absence of a Fastly rate limiter are left open.

## Changes made

1. Finding 1 — signing key extractability. `loadKeyMaterial`
   (`src/cloudflare.ts`) now imports the private key with
   `extractable: false` whenever `UMAXICA_JUMP_PUBLIC_JWKS` /
   `UMAXICA_JUMP_PUBLIC_KEYSET` is configured, which is the production
   case. `extractable: true` remains only on the branch that has to call
   `exportJWK` to derive the public keyset from the private key.

2. Finding 2 — rate-limit scope. `checkRateLimit` no longer filters on
   `pathname === '/'`, and now runs ahead of the static-asset branch in
   the `fetch` handler, so `/about`, `/health*`,
   `/.well-known/jwks.json`, `/sitemap.xml`, `/robots.txt` and
   `/favicon.ico` are metered like the redirect route. Both fail-open
   branches are unchanged and still logged.

3. Finding 4 — issuer-registration oracle. `jwks_bad_gateway` and
   `jwks_unavailable` moved from `UNAVAILABLE` to `CLIENT_DENIED` in
   `src/core/public_error.ts`, so they answer `400 invalid_request` like
   every other token rejection. `signer_unavailable` — Jump's own
   configuration, independent of any inbound token — keeps
   `503 service_unavailable`. The real code still reaches operators via
   the structured security log. Trade-off accepted with the user: an
   issuer-side outage is no longer distinguishable as retryable in the
   public response.

4. Finding 5 — health disclosure. `healthJson` returns `SERVICE.version`
   unconditionally and `RuntimeInfo.version` was removed; `cloudflare.ts`
   no longer passes the deployment revision into the runtime. The
   revision still keys the isolate caches, it is simply not published.

5. Finding 6 — fail-closed defaults. `createApp` throws when
   `runtime.production` is true and no explicit `registry`, or neither
   `jwksCache` nor `fetchJwks`, was supplied, instead of silently falling
   back to the example registry and example keyset.

6. Finding 8 — `public/_headers` now mirrors the full
   `STANDALONE_HTML_SECURITY_HEADERS` set (CSP, COOP/COEP/CORP,
   Permissions-Policy, `Cache-Control: no-store` and the rest) rather
   than five headers.

7. Finding 9 — `.github/workflows/integration.yaml` pins every action by
   commit SHA with the tag in a trailing comment
   (`actions/checkout` fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09,
   `pnpm/action-setup` b906affcce14559ad1aafd4ab0e942779e9f58b1,
   `actions/setup-node` 49933ea5288caeca8642d1e84afbd3f7d6820020,
   `gitleaks/gitleaks-action` ff98106e4c7b2bc287b24eaf42907196329070c7;
   SHAs resolved through the GitHub API on this date). The pnpm version
   in CI moved from `10.29.3` to `12.0.0` to match `engines.pnpm` under
   `engine-strict=true`.

`docs/security.md` gained "Public Errors" and "Rate Limiting" sections
and records the non-extractable key import and the health-version
contract.

## Deliberately not done

- Finding 7 (CSP violation reporting): no collector exists, and adding a
  `/csp-report` receiver would mean a new unauthenticated POST endpoint
  with its own body and rate limits. Declined as speculative under the
  repository's YAGNI rule.
- Finding 3 and the Fastly rate limiter: out of scope by decision until
  Fastly is deployed.
- Finding 10 (replay within `exp`): accepted by design, unchanged.

## Tests added

- `test/cloudflare-key-material.test.ts` (new file): mocks `importPKCS8`
  through `vi.mock('jose')` and asserts `extractable: false` with a
  configured keyset and `extractable: true` on the derive path.
- `test/security-hardening.test.ts`: issuer JWKS failures share the
  client-denial class; production `createApp` refuses example config
  while a local runtime still boots from it; `public/_headers` parses to
  exactly `STANDALONE_HTML_SECURITY_HEADERS`.
- `test/jump.test.ts`: health never contains the revision id or deploy
  tag; every unauthenticated route is metered (4 limiter calls across
  `/`, `/.well-known/jwks.json`, `/about`, `/health`); static assets are
  metered too.

## Commands run

- `pnpm run format` — 84 files.
- `pnpm run lint:check` — clean.
- `pnpm run typecheck` — clean.
- `pnpm exec knip --include unlisted,unresolved,binaries` — exit 0, no
  findings.
- `pnpm run test` — 185 tests, 4 files, all passed (was 179/3).
- `pnpm run cloudflare:check` — Wrangler 4.132.0 dry-run succeeded;
  bindings `JUMP_RATE_LIMITER` (600 requests/60s), `ASSETS`, version
  metadata, `UMAXICA_JUMP_ORIGIN`, `UMAXICA_JUMP_PRIVATE_KEY_KID`,
  `UMAXICA_JUMP_PUBLIC_JWKS`.
- `pnpm audit` — no known vulnerabilities.

Not run: `pnpm run test:e2e`, and no deployed-environment verification.
