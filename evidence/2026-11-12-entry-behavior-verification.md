# Entry behavior verification

Verified the agreed entry behavior against the working trees of Jump and Away:
valid tokens reach the intended action, bare `/` redirects to `/about`, and
invalid tokens return error responses without a `Location` header.

Strengthened Jump malformed-token and signature-failure assertions to require
no redirect. Added a real-browser case for bare-entry navigation and malformed
or empty tokens. Strengthened Away signature-failure assertions and added HTTP
E2E rejection checks for empty, malformed and raw destination queries.
Application behavior was unchanged.

Using Node 24.21.0 and pnpm 12.0.0, Jump passed `format:check`, `lint:check`,
`typecheck`, `test` (2,217 tests) and `test:e2e` (36 tests).
Jump `test:worker` could not start: `miniflare` was not resolvable from
`scripts/test-worker.mjs` (`ERR_MODULE_NOT_FOUND`). This does not establish a
Worker-runtime pass for Jump.

Using Node 24.20.0 and pnpm 12.0.0, Away passed `format:check`, `lint:check`,
`typecheck`, `test:cov` (152 tests, coverage thresholds met), `test:e2e`
(4 tests), and `test:worker` (health and not-found contracts).
No production deployment or live issuer checks were performed.
