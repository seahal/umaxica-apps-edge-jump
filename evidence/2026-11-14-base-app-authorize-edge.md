# Base App authorization carrier review

Reviewed source `68153478a3eb03ac85964298ce400d582f6f025d` on 2026-11-14.
The owner's uncommitted packageManager SHA512 correction was present and retained.
The untracked work order and earlier implementation-status evidence were retained.
Results include the new uncommitted production-contract tests and documentation;
application code, registry, limits, secrets and Cloudflare state were not changed.

## Existing mapping and namespace decision

`src/config/registry.umaxica.ts` defines 15 origins and 38 directed edges.
An issuer identity is its origin, with JWKS at that origin's
`/.well-known/jwks.json`; node IDs are local graph labels, not JWT claims.
Per owner-supplied Cosmos facts (not independently inspected), Governance owns
`www.umaxica.app` (Base APP); Access owns `visa.umaxica.app` and
`auth.umaxica.app`. The equivalent ORG graph exists too. Base <-> Visa and
Base <-> Auth already exist in both realms. APP -> ORG is forbidden.
No new issuer namespace is required for the described Base sign entry.

A dedicated label alone would not change issuer identity or isolate keys.
A genuinely new Governance origin would require owner-chosen hosts, published
JWKS, new graph edges, issuer/receiver changes and coordinated rollout. It adds
identity separation only if a separate origin is actually desired; for the
existing Base origin it duplicates a role already represented. Owner decision
remains open; no node was added or renamed.

`buildRegistry` selects one JWKS URL per origin. It does not check that every
host owned by one repository publishes identical keysets. That is an external
Access/Governance obligation, NOT_VERIFIED here.

## Executed tests

Added nine tests under `Governance Base App authorization carrier` in
`test/production-contract.test.ts`, using the real Cloudflare adapter, literal
production graph and the existing ephemeral RSA-3072 test fixtures. No production
key was generated, read or registered.

- Base APP -> Visa APP `/oauth/authorize` returns 302; all nine OIDC parameters
  retain exact query bytes, including mixed percent-escape case and spaces
  represented as `%20` and `+`. The outbound PS256 signature verifies; its
  `url` equals the destination before the appended RT, `src` is Base APP and
  structural TTL is 30 seconds.
- Visa ORG and an unlisted origin return 400 without Location.
- Access keys cannot impersonate Base; Base keys cannot impersonate Access.
- A forbidden `next` query returns 400. Captured application console output
  and response bodies omit the RT, destination and distinctive query values
  on success, graph rejection, signature rejection and query-policy rejection.
- URL boundaries 2047/2048 succeed with unchanged query prefix; 2049 is refused.
  Existing token boundaries 4095/4096/4097 and all-pairs graph tests also passed.

No behaviour fix or RED failure was necessary: the required current edge already
works. Tests prove local application behaviour, not Rails or deployed Workers.
`wrangler.jsonc` enables `redact_query_string` in production and staging;
installed Wrangler schema describes removal of query strings from logs and
traces. Existing config tests passed. Actual persisted platform logs/traces
were not inspected: NOT_VERIFIED, deployment/operator follow-up required.

## Checks

Used the already-installed pnpm 12.18.0 at
`/home/mslo/.local/share/mise/installs/pnpm/12.18.0/pnpm`, with its directory
prepended to PATH. The default `/usr/bin/pnpm` still stops at a read-only store
operation lock. No lockfile, store configuration or installation was changed.
Runtime reported by Playwright: Node 26.12.0; package pin is 26.13.1, so this
does not prove checks under the exact pinned Node version.

- `pnpm run typecheck`: passed.
- `pnpm run lint:check`: passed.
- `pnpm run test -- test/production-contract.test.ts`: script ran the full
  suite, 22 files / 2232 tests passed.
- `pnpm run test:e2e`: blocked before tests; web server failed with
  `listen EPERM` at `127.0.0.1:4173`. Browser acceptance is NOT_VERIFIED.
- Initial `pnpm run format:check` found formatting in the modified test and
  pre-existing `plans/2026-11-14-handoff-carrier-readiness-work-order.md`.
  `pnpm run format` passed; its only unrelated tracked formatting change was
  two blank lines before lists in that work order (no instruction changes).
- Final `pnpm run format:check`, `pnpm run lint:check`,
  `pnpm run typecheck` and `pnpm run test`: all passed; 22 files / 2232 tests.
- `git diff --check`: passed. No commit or deployment was made.

## Questions retained for the owner

- Cosmos describes Core at `www-jp.umaxica.*`, but this registry labels those
  origins Warp and labels `jp.umaxica.*` Core. Confirm the desired host/role
  mapping before changing nodes, docs or the issuer graph.
- Four `.com` origins remain: Auth, Base, Core and Warp; there is no Visa
  `.com`. Confirm retirement scope from Cosmos evidence;
  this review does not remove any origin. The four `.com` nodes and their edges
  are still covered by current tests.
- Confirm whether any genuinely new Governance origin is desired. Existing Base
  origins already support the described APP/ORG carrier paths.

Size measurements, rate-limit margin and remaining readiness gates are in
[carrier readiness](2026-11-14-handoff-carrier-readiness.md).
