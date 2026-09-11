# Request-log JWT path redaction

Extended Hono request-log redaction so a compact JWT accidentally placed in
the request path, including `/rt=<jwt>`, is replaced with `[redacted-jwt]`.
Query-string redaction remains unchanged.

Checks performed on 2026-09-12:

- `pnpm run format`: passed.
- `pnpm run lint`: passed.
- `pnpm run typecheck`: passed.
- `pnpm exec vitest run test/jump.test.ts test/evidence-layout.test.ts`: 158
  tests passed.
- `pnpm install --frozen-lockfile`: passed.

A temporary three-variant Wrangler diagnostic was prepared under `/tmp` but
could not be started in this execution environment because Wrangler reported
`uv_interface_addresses returned Unknown system error 1`. No network result was
claimed from that blocked check.

The same diagnostic was run successfully by the user: plain fetch returned 200
in 136 ms, while both variants using `redirect: "error"` failed immediately.
Workerd reported that only `follow` and `manual` are implemented. The production
fetch was changed to `manual`; redirects remain rejected by the existing
non-2xx response check.
