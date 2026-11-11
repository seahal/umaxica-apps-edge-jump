# Security review after PS256 and route-policy changes

Scope: current local working tree, Cloudflare entry, JWT/JWKS verification and
signing, URL/edge policy, logging/headers and production dependency audit.
The owner deferred .com cleanup. No production requests, external configuration
changes, receiver audit, secret scan or penetration test were performed.
Application code and dependency versions were not changed by this review.

## Findings

1. **Moderate, dependency advisory confirmed; runtime exploitability unconfirmed.**
   `pnpm audit --prod --json` reports minimatch 10.2.6 via
   @fastly/hono-fastly-compute / @fastly/js-compute -> @bytecodealliance/jco ->
   @bytecodealliance/jco-std. GHSA-g3hv-75wg-m249 / CVE-2026-118764:
   attacker-controlled glob patterns with optimizationLevel >= 2 can amplify
   CPU/memory use; patched version 11.0.1. Audit totals: 1 moderate, 0 high,
   0 critical. `rg` found these Fastly dependencies in package.json but no
   Fastly/minimatch/jco imports in src or scripts. This is not proof that all
   build tooling or deployed bundles are unreachable. Remove unused Fastly
   dependencies or update the introducing chain; verify the resulting lockfile.
   Source: https://github.com/advisories/GHSA-g3hv-75wg-m249
2. **Conditional availability risk, confirmed fail-open behavior.**
   src/cloudflare.ts checkRateLimit catches limiter call exceptions and returns
   null, allowing JWT work to continue. Missing bindings, missing/invalid client
   IP and deadline expiry fail closed. An attacker cannot be assumed to trigger
   the exception; during a limiter outage, however, this protection is absent.
   The owner subsequently accepted this risk in ADR 0009; it is not an open
   remediation requirement. See docs/playbook/paas-availability.md.
   Existing test `a rate limiter binding failure fails open without logging
   request data` reproduces this. Consider fail-closed handling if availability
   policy permits it; signature/edge checks are not bypassed by this condition.
3. **Conditional integration risk, intentional bearer-token reuse.**
   rt is URL-visible and reusable until expiry, not browser/session-bound.
   Re-evaluation produces a fresh return jti and 30-second return lifetime.
   Stealing an unexpired rt therefore enables replay; a new jti does not prove
   a new authorized operation. Existing repeated-jti tests confirm reuse.
   Authentication/CSRF/state/nonce/PKCE and transaction deduplication must be
   enforced by the receiver. No receiver defect or authentication bypass was
   demonstrated. Removing /sign/out denial is not itself an identified flaw.
4. **Operational caveat, not a demonstrated exploit.**
   Imported Jump signing material caches for 300000 ms by env/revision/kid.
   Editing material under the same kid does not immediately change a warm
   signer. Emergency revocation must be enforced at receivers, not merely by
   removing a public key; use a new kid and validate deployment/cache behavior.
   This review did not test an actual production rotation or revocation.

## Controls inspected

PS256-only RSA-3072/exponent-65537 profile, exact issuer and audience, short TTL,
closed claims/headers, ES384 rejection, pinned HTTPS issuer JWKS with no redirect
following and 64 KiB body/4-key caps; bounded per-issuer cache with refresh
cooldown; allowlisted origin edges and explicit source-to-self rejection;
strict path/query syntax; no destination fetch; query/path log redaction and
no-store/no-referrer/CSP headers. No signature bypass, allowlist bypass or
arbitrary outbound SSRF was confirmed in the inspected paths.

Algorithm/issuer/audience review reference:
https://www.rfc-editor.org/rfc/rfc8725 (sections 3.1, 3.8, 3.9).
This is a scoped source review and regression run, not a safety certification.

## Validation actually performed

Via `mise exec pnpm@12.0.0 -- pnpm run <script>`:

- format:check, lint:check and typecheck passed (lint without warnings).
- test: 21 files, 2216 tests passed in 51.72 seconds.
- Production dependency audit completed with exit 1 for the advisory above:
  `timeout 30 mise exec pnpm@12.0.0 -- pnpm audit --prod --json`.
  Initial sandbox audit did not return and was interrupted; a retry outside
  the sandbox returned the advisory. A proposed fetch-timeout CLI option was
  unsupported and did not perform an audit.
- Worker integration remains unverified: earlier attempt in this session could
  not start because miniflare was missing. Dev dependencies were not audited.
- Actual Cloudflare redaction, WAF/rate limits, browser history handling,
  deployed configuration and Cosmos receiver behavior remain unverified.
