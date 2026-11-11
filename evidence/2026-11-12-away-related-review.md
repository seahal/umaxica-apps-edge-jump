# Away-related security review

Reviewed the working tree for the two findings recently fixed in Away.
Application code was not changed.

- Shared JWKS cancellation remains an availability concern:
  `src/core/jwks_cache.ts:120` passes the initiating caller's signal into
  `fetchAndCache`, which passes it to the shared fetch at line 136. Aborting
  that caller fails concurrent waiters too. Existing executable reproduction:
  `test/failure-concurrency.test.ts`, test "one cancelled single-flight fails
  closed for waiters then recovers". Unlike Away, `deadline_exceeded` is not
  negative-cached for 30 seconds. Recommended change: independently bound the
  shared fetch and use caller signals only to stop individual waits; retain
  in-flight state until the underlying fetch settles.
- No equivalent encoded authentication-path denial bypass was identified:
  `assertDirectPath` rejects encoded separators, percent signs and semicolons;
  `assertPathAllowed` decodes paths before comparison. The current path denylist
  is empty by explicit policy, and OAuth handling differs from Away. This is
  not a comprehensive audit of all downstream OAuth receivers.

Validation using `mise exec node@24.21.0 pnpm@12.0.0 -- pnpm run <script>`:
`format:check`, `lint:check`, `typecheck`, and `test` all passed.
Unit results: 21 files, 2,216 tests passed. The cancellation reproduction above
was included. Production traffic and upstream JWKS endpoints were not tested.

## Remediation

Shared loads now use an independent 1000 ms deadline. Individual callers race
only their wait against their own signal; the in-flight entry is retained until
the load settles. Shared timeouts are reported as upstream unavailability.
Cancellation regression tests now require other waiters and later callers to
share the surviving load. A separate timeout test covers an unresponsive fetcher.
Architecture and security documentation describe the updated lifecycle.
The same individual-wait cancellation pattern was applied to Away, retaining
its existing independent fetch timeout and its own error and token contracts.

Post-remediation validation: Jump `format:check`, `lint:check`, `typecheck`
and full `test` passed (21 files, 2,217 tests). Targeted cancellation/availability
suite also passed (23 tests). Away `format:check`, `lint:check` and `test:cov`
passed (151 tests, 99.78% statements, 99.76% branches, 100% lines/functions).
Away `typecheck` still fails on the previously observed missing platform types
(`ExecutionContext`, `CryptoKeyPair`, `JsonWebKey`); no new errors were reported.
