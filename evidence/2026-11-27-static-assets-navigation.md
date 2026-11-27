# Static Assets navigation regression

- `pnpm run test:worker` passed on local Miniflare/workerd with the Wrangler asset directory, binding, routing patterns, and 404 fallback. Raw HTTP sent `Sec-Fetch-Mode: navigate` to the asset router.
- Bare root and an unknown path returned the HTML 404 through the Worker. Invalid RT returned 400 with `X-Jump-Error: invalid_request`. A signed test RT returned 302 to the expected receiver. About and health returned 200. The favicon matched the asset bytes and omitted the Worker request ID.
- The sandboxed run could not bind loopback (`listen EPERM`). The local run with listener permission passed, including the existing 20 signed edges.
- `pnpm run format:check`, `pnpm run lint:check`, `pnpm run typecheck`, `pnpm run test` (2,133 tests), and `WRANGLER_WRITE_LOGS=false pnpm run cloudflare:check` passed. The Wrangler check was a dry run.
