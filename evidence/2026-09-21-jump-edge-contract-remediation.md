# Jump edge-contract remediation

Date: 2026-09-21. Working tree after aligning production observability,
HSTS, public JWKS-outage errors, and documentation. Complements
`2026-09-21-jump-security-investigation.md`. This is configuration and
failure-classification drift, not a redesign of JWT, allowlists, or
replay.

## Commands run

- `pnpm run format` / `lint:check` / `typecheck` — clean
- `pnpm run test` — 188 tests, 4 files, all passed (was 185)
- `pnpm audit` — no known vulnerabilities found
- `wrangler whoami` — logged in to account UMAXICA; `zone` is read-only
- Cloudflare API `GET /zones?name=umaxica.net` — zone
  `d1c2e765f7b5c9b343f7e03a31d91ecf` exists
- Cloudflare API rulesets, managed transforms, and zone settings —
  403 with the current OAuth token
- `gh api repos/seahal/umaxica-apps-edge-jump/private-vulnerability-reporting`
  — `{ "enabled": true }`
- Dashboard traces were not opened (UNVERIFIED)

## Repository changes

- `wrangler.jsonc`: `redact_query_string: true`; traces `enabled: false`
  and `persist: false`; no log/trace destinations; invocation logs remain
  off. Sampling was not used as a privacy control.
- Public errors: `jwks_unavailable` → `temporarily_unavailable` / 503.
  `jwks_bad_gateway` stays `invalid_request` / 400. Internal logs still
  carry `jwks_unavailable`. Isolate-local negative cache for that code
  uses the existing 30 s JWKS negative TTL.
- HSTS max-age in Worker, `public/_headers`, tests, and docs is
  `31536000` (12 months) with `includeSubDomains; preload` unchanged.
- `SECURITY.md` points at GitHub private vulnerability reporting.

## Not applied from this tree

Hostname-specific Response Header Transform and Configuration Rule for
`jump.umaxica.net` (zone overlay of Referrer-Policy / X-Frame-Options /
X-XSS-Protection, and HTML rewriting). Required steps are in
`docs/operations/production-configuration.md`. `/cdn-cgi/trace` left as
documented residual exposure.
