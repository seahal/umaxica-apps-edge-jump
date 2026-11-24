# Dependency refresh and worker follow-up

On 2026-11-24, refreshed dependencies and retained the repository's supply-chain settings: `ignoreScripts: true`, `minimumReleaseAge: 4320`, and the existing `allowBuilds` policy. `pnpm outdated` returned no dependency updates. `pnpm@12.23.0` was released on 2026-11-22, less than 72 hours before this validation, so the project remains on eligible `pnpm@12.22.0` with its matching integrity hash.

Updated packages: `hono@4.13.19`, `jose@6.2.18`, `@hono/node-server@2.1.11`, `@playwright/test@1.65.1`, `knip@6.47.0`, `wrangler@4.166.0`, `miniflare@5.20261119.0-beta`, `@cloudflare/workers-types@5.20261121.1`, `vitest@5.1.1`, `@vitest/coverage-v8@5.1.1`, `vite-plus@1.7.0`, and the aligned `vite` alias `@voidzero-dev/vite-plus-core@8.3.8000`. Also refreshed `@types/node@26.6.6`, `esbuild@0.28.2`, and `typescript@7.0.2`.

Validation results:

- `pnpm audit --audit-level=low`: passed; no known vulnerabilities.
- `pnpm outdated`: passed; no output.
- `pnpm run format:check`, `pnpm run lint:check`, `pnpm run typecheck`: passed.
- `KNIP_DISABLE_RAW_TRANSFER=1 pnpm exec knip`: passed; zero findings.
- `pnpm run test:cov`: 22 files and 2,094 tests passed; statements 100% (1,134/1,134), branches 100% (893/893), functions 100% (204/204), lines 100% (976/976).
- `pnpm run test:worker`: passed; 20 signed edges and deadline, JWKS reuse, limiter, Fetch Metadata, and signing-material contracts.
- `pnpm run test:e2e`: 36 Chromium tests passed.
- `pnpm run cloudflare:check`: passed with Wrangler dry-run.
