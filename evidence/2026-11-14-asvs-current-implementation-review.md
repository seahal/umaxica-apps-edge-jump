# Current implementation review against ASVS 5.0.0

Reviewed on 2026-11-14. Base commit: `9ff5194d70bc16789e977bf1f65d55720a9d9f5f`.
Scope includes the existing uncommitted changes to `src/core/normalize_url.ts`
and `test/security-hardening.test.ts`, and the existing untracked
`docs/receiver-rt-exposure-report.md`. Application code was not changed.

## Verdict and scope

No critical/high vulnerability, signature bypass, destination-allowlist bypass,
or attacker-selected JWKS fetch was demonstrated in the inspected paths.
This is a scoped source review with local regression checks, not full ASVS L1/L2
verification or a production approval. Known dependency and integration risks
prevent an unconditional clean verdict.

Inspected Cloudflare dispatch/signing/key caches, JWT verification, issuer JWKS
import/fetch/cache, URL/path/query/edge policy, Fetch Metadata, security headers,
application logging, Wrangler configuration, receiver contract and CI workflow.
No deployment, receiver-runtime audit, production traffic, live Cloudflare
configuration/log inspection, fresh install, secret scan, browser E2E or workerd
integration run was performed. Current CI status was not queried.

## Findings

1. **Moderate dependency advisory; production exploitability unconfirmed.**
   Current lockfile retains `minimatch@10.2.6` through the Fastly tooling chain
   (the Fastly packages remain production dependencies in package.json).
   The maintainer advisory GHSA-g3hv-75wg-m249 / CVE-2026-118764, checked live,
   identifies 10.2.6 and a CPU/memory amplification condition involving
   attacker-controlled patterns with optimizationLevel >= 2; patched: 11.0.1.
   No Fastly/minimatch/jco references were found in `src` or `scripts` by `rg`.
   That does not prove absence from all build/deployed artifacts. Remove unused
   dependencies or update the introducing chain and verify the lock/install.
   A fresh advisory inventory did not complete; do not treat this as its only
   possible advisory.
2. **Conditional data-exposure/replay risk: URL-carried reusable tokens.**
   `handle_jump.ts:93-95` reads inbound rt from the URL, and `:105-123` creates a
   reusable outbound token containing the signed destination URL and appends it
   to Location. JWS provides integrity, not payload confidentiality. Sensitive
   OAuth query values carried inside the signed destination remain readable.
   ASVS v5.0.0-14.2.1 cannot be marked passed when these URLs/tokens contain
   sensitive data. This is a protocol-wide concern, including ingress, browser
   history and both endpoints, not solely a receiver concern. no-store,
   no-referrer and query redaction reduce particular leak paths but do not
   remove URL exposure. Actual receiver leakage or account takeover was not
   demonstrated; impact depends on token content and receiver behavior.
   Reuse is accepted in ADR 0002; absence of a Jump replay database is therefore
   not a newly identified implementation defect. Receivers must independently
   authorize operations and bind state/nonce/PKCE and transaction identity as
   appropriate, redact logs and promptly redirect to a clean URL. Consuming an
   outbound jti once is insufficient to deduplicate an inbound replay because
   Jump generates a fresh outbound jti each time. The existing receiver exposure
   report's description of jti consumption as the only replay-protection layer
   is incomplete; its receiver-only framing also omits inbound URL exposure.
3. **Accepted availability risk, not an authorization bypass.**
   `checkRateLimit` continues after a limiter call exception; this is explicitly
   accepted in ADR 0009. Missing bindings/IP and malformed results fail closed;
   JWT and destination checks still execute. Retain outage monitoring and
   capacity planning. No attacker-triggerable exception was demonstrated.
4. **Hardening consideration: production generic typ.**
   `token_profile.ts:11` retains JWT for both directions; staging uses separate
   explicit types. This gives production less type-based separation (ASVS
   9.2.2 / RFC 8725 sections 3.11-3.12). Exact issuer/audience, closed schemas,
   subject and signature checks provide other separation; no cross-token
   substitution was demonstrated. Coordinate explicit typing with receivers;
   generic typ alone is not proof of a vulnerability.

## Controls observed against selected requirements

- 9.1.1-9.1.3: JOSE signature verification, PS256-only algorithm, registered
  issuer-pinned JWKS; arbitrary key-source headers rejected.
- 9.2.1, 9.2.3-9.2.4: required dates, maximum 30-second structural inbound TTL,
  5-second clock tolerance, exact string audience and issuer, outbound audience
  set to an approved destination. 9.2.2 has the typing caveat above.
- 13.2.4: static HTTPS JWKS destinations, manual redirect rejection, 64 KiB
  streamed body limit, four-key cap, bounded issuer cache and refresh cooldown.
  The gateway does not fetch the navigation destination.
- Redirect handling: exact directed origin edges, source-to-self prohibition,
  direct path checks before WHATWG normalization, reserved/duplicate query
  rejection and preservation of opaque OAuth values.
- 14.3.2 and logging protections: no-store/no-referrer, strict CSP/HSTS,
  no cookies, application query/path redaction and configured platform query
  redaction. Live platform enforcement and receiver behavior are unverified.

## Validation performed

The initial `/usr/bin/pnpm run` attempts for format:check, lint:check, typecheck
and test all stopped before execution with ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK
(read-only package-manager store). Retried with the already installed matching
pnpm executable `/home/mslo/.local/share/mise/installs/pnpm/12.18.0/pnpm`:

- `pnpm run format:check`: passed, 197 files at that point.
- `pnpm run lint:check`: passed.
- `pnpm run typecheck`: passed.
- `pnpm run test`: passed, 22 files / 2233 tests, 31.73 seconds.
- `timeout 25 <matching-pnpm> audit --prod --json`: timed out, exit 124,
  without an advisory result. Full and development dependency audits remain
  unverified. No dependency or registry configuration was changed.

Check variants were used to preserve the user's existing changes. This evidence
file was added after the suite above; its final formatting is checked separately.

## Current primary references

- Stable ASVS 5.0.0: https://asvs.owasp.org/downloads/
- Token requirements: https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x18-V9-Self-contained-Tokens.md
- Data protection: https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x23-V14-Data-Protection.md
- Configuration: https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x22-V13-Configuration.md
- JWT BCP: https://www.rfc-editor.org/rfc/rfc8725.html
- OAuth security BCP: https://www.rfc-editor.org/rfc/rfc9700.html
- Maintainer advisory: https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249
- Workers guidance: https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
