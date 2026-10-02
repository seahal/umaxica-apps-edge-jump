# Additional hardening baseline and review

Branch: develop. HEAD: 5c82d5b3883840637481d13babfe5902db02f99a. Service: 0.2.0. JWT schema: 1.

Initial working tree (all preserved as the implementation baseline):

```text
 D .vite-hooks/pre-commit
 M README.md
 M SECURITY.md
 M adr/0001-no-static-asset-serving.md
 M adr/0004-multiple-jump-implementations.md
 M docs/architecture.md
 M docs/compatibility.md
 M docs/decisions.md
 M docs/faq.md
 M docs/glossary.md
 M docs/implementations.md
 M docs/logging.md
 M docs/operations/key-rotation.md
 M docs/operations/production-configuration.md
 M docs/operations/schema-migration.md
 M docs/security.md
 M docs/threat-model.md
 M e2e/server.ts
 M e2e/smoke.spec.ts
 D fastly.toml
 M knip.json
 M package.json
 M playwright.config.ts
 M pnpm-lock.yaml
 M pnpm-workspace.yaml
 M src/cloudflare.ts
 D src/config/jwks.example.json
 D src/config/registry.example.ts
 M src/config/registry.umaxica.ts
 M src/core/fetch_jwks.ts
 M src/core/handle_jump.ts
 M src/core/jump_jwks.ts
 M src/core/jwks_cache.ts
 M src/core/normalize_url.ts
 M src/core/page.tsx
 M src/core/policy.ts
 M src/core/render_about.ts
 M src/core/types.ts
 M src/core/verify_jwt.ts
 D src/fastly.ts
 M src/index.ts
 M test-results/.last-run.json
 M test/cloudflare-key-material.test.ts
 M test/jump.test.ts
 M test/security-hardening.test.ts
 M wrangler.jsonc
?? adr/0005-production-jump-0.2.md
?? docs/protocol.md
?? docs/receiver-contract.md
?? evidence/2026-10-02-ci-dependency-audit-investigation.md
?? evidence/2026-10-02-dependency-update-attempt.md
?? evidence/2026-10-02-jump-0-2-security.md
?? plans/jump-0.2-security.md
?? scripts/test-worker.mjs
?? src/core/deadline.ts
?? test/app-fixture.ts
?? test/failure-concurrency.test.ts
?? test/fixtures/
?? test/production-contract.test.ts
?? test/token-boundaries.test.ts
```

Scripts: format, format:check, keys:generate, cloudflare:check, cloudflare:dev, lint, lint:check, typecheck, test, test:cov, test:e2e, test:worker. Runtime harness: scripts/test-worker.mjs, esbuild + Miniflare/workerd with dispatchFetch and pinned issuer JWKS interception. Existing CI: quality, unit coverage, browser e2e, dependency audit, secret scan, Cloudflare dry-run; no runtime gate initially. Harness instructions: AGENTS.md, CLAUDE.md import shim, pnpm scripts, vitest.config.ts, playwright.config.ts, tsconfig.json, wrangler.jsonc, .github/actions/pnpm-project/action.yml (frozen install).

Preimplementation adversarial review: origin is required with no fallback; inbound aud, outbound iss, self-link, discovery and app identity cache consume configured origin. Adapter rejects mismatched request origins. Key bundle cache is env/revision/kid scoped; explicit JWKS and nonextractable private import with cryptographic probe are already required. Health proves responsiveness, not signer readiness. Existing runtime harness checks signed graph edges and wrong-path rt, but lacks CI gate and readiness cases. Recovery must not return to pre-0.2 output without reuse; old graphs, lost public-key overlap and identity changes can reject newly issued or unexpired tokens. No immutable compatible recovery artifact or production state is verified.
