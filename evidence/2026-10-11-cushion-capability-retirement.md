# Unused Cushion capability retirement

Date: 2026-10-11. Original branch feature / baseline HEAD 0e0b3c62057ecfdf373dc463853efa7fe7255ba6 plus existing candidate changes. User explicitly confirmed Cushion non-use and authorized deletion. This is owner confirmation, not telemetry-derived production non-use proof. No deployment or external configuration change performed.

## Removed and preserved

Removed renderCushionPage and truncate helper, dedicated history.replaceState script and CSP hash, unused translations, Cushion-specific styles and external-only Unicode/Punycode display helper src/core/idna.ts and associated NormalizedUrl display fields. Removed four dormant renderer success tests and two tests solely for the retired IDNA display decoder. Their removal accounts for the change from 1,313 to 1,307 unit cases; no security rejection test was skipped or removed. The canonical ASCII IDN-host normalization test remains.

Retained external/missing/invalid dst rejection, signed production graph and audited path rejection, URL validation, query policy, OAuth opaque-state regressions, signature/key/TTL checks, common security headers and error back-button script/CSP hash. Health definition-list CSS remains shared. Existing CSP tests now explicitly assert absence of retired script permission and presence/correct hash of splash script. Product CSS hash recalculated to Qdy3/sCzBklCCdz6I+FbsB2baE52GY1ktdxwv85J56E= in Worker and public/_headers.

Current README, protocol, FAQ, architecture, ADR 0007, internal-only plan and release gates updated to distinguish authorized local source retirement from pending runtime/production closure. Historical investigations remain historical records.

## Fresh verification

Executed using pnpm 12.0.0 and Node 24.21.0 in /tmp/jump-runtime-acceptance/repo with complete copied installed dependencies, synchronized candidate source and deletion. This is not a fresh network install.

- pnpm exec oxfmt changed files --write: exit 0; formatting only the listed files.
- pnpm run format:check: exit 0 after correcting one edited assertion's formatting.
- pnpm run lint:check: exit 0.
- pnpm run typecheck: exit 0.
- pnpm run test: exit 0; 19 files / 1,307 PASS.
- pnpm run test:cov: exit 0; statements 99.65%, branches 99.22%, functions 100%, lines 99.69%.
- KNIP_DISABLE_RAW_TRANSFER=1 pnpm exec knip --include unlisted,unresolved,binaries: exit 0.
- pnpm run cloudflare:check: exit 0, Wrangler dry-run only; no production binding proof.
- pnpm run test:worker: exit 1, BLOCKED by listen EPERM 127.0.0.1.
- pnpm run test:e2e: exit 1, BLOCKED by listen EPERM 127.0.0.1:4173.

Initial deletion validation caught and corrected an empty CSP assertion left by cleanup: typecheck failed and seven response tests failed; final executions above pass. No failed check was suppressed.

## Remaining gates

RELEASE_BLOCKED. Local Phase 3 source retirement implemented; real workerd, browser/Dark Mode, candidate CI, production inventory/receiver compatibility and recovery evidence remain pending. Dependency installation/audit DNS blockers recorded in the preceding remediation evidence remain unresolved. Original .git is read-only; immutable candidate commits are created only in /tmp, not in the original checkout.
