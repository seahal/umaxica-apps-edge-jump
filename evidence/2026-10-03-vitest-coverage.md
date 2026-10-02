# Vitest coverage raised above 99.5%

Command: `pnpm run test:cov` (coverage scoped to `src/**`, thresholds 99% in
`vitest.config.ts`).

| Metric     | Before (all files) | After (`src/**`) |
| ---------- | ------------------ | ---------------- |
| Statements | 93.54%             | 100% (1144/1144) |
| Branches   | 90.27%             | 100% (884/884)   |
| Functions  | 95.28%             | 100% (197/197)   |
| Lines      | 95.72%             | 100% (986/986)   |

515 tests passed. `pnpm run lint` and `pnpm run typecheck` were clean.

New tests: `test/core-edges.test.ts`, `test/cloudflare-edges.test.ts`.
Branches that cannot be reached because an earlier check already rejects the
input are marked `/* v8 ignore */` with a reason, following the existing
convention in `src/core/verify_jwt.ts`, including the external allow-list
check at `src/cloudflare.ts:126` (the production registry has none).
