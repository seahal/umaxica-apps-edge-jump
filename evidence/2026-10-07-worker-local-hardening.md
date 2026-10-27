# Worker-local hardening: JWKS availability, app cache lifetime, Fetch Metadata

Date: 2026-10-07. Status: **BLOCKED_BY_EXISTING_BASELINE**. Branch `develop`,
HEAD `1cbec980fbc030c508f574e0521cd2467c5b44a6`, changes uncommitted on top of
pre-existing uncommitted work in 18 files, which was left as it was. No commit,
push, deploy, Cloudflare account change, secret change, Rails change or new
storage. Everything below was run in this session unless marked otherwise.

## Environment

The default `pnpm` 12.4.2 is refused with `ERR_PNPM_BAD_PM_VERSION`. All
commands used the pinned `pnpm` 12.0.0 and Node 24.20.0 from the local mise
installs, through `PATH`; no policy, registry or version check was bypassed.
Resolved: `hono` 4.13.12, `@hono/node-server` 2.1.3, `jose` 6.2.12, `miniflare`
5.20261001.0-alpha, `workerd` 1.20261001.1, `wrangler` 4.147.0.

## Validation

| Command                                       | Before | After | Note                               |
| --------------------------------------------- | ------ | ----- | ---------------------------------- |
| `pnpm install --frozen-lockfile`              | 0      | —     | lockfile passes supply-chain rules |
| `pnpm run format:check`                       | 0      | 0     |                                    |
| `pnpm run lint:check`                         | 0      | 0     |                                    |
| `pnpm run typecheck`                          | 0      | 0     |                                    |
| `pnpm run test`                               | 1      | 1     | 2 failed/574 passed → 2/871        |
| `pnpm run test:cov`                           | 1      | 1     | same 2 failures; no report emitted |
| `pnpm run test:worker`                        | 0      | 0     | actual Miniflare/workerd           |
| `pnpm run test:e2e`                           | 0      | 0     | 17 passed                          |
| `knip --include unlisted,unresolved,binaries` | 0      | 0     | `KNIP_DISABLE_RAW_TRANSFER=1`      |
| `pnpm audit --audit-level=high`               | 1      | 1     | 1 high, see blockers               |
| `pnpm outdated`                               | —      | 0     | informational, no output           |
| `pnpm run cloudflare:check`                   | 0      | 0     | 285.83 → 288.44 KiB upload         |

Coverage gate: `test:cov` cannot evaluate the 99% thresholds while two tests
fail. An informational run excluding only `test/internal-only.test.ts` gave
statements 99.91, branches 99.88, functions 100, lines 100 (846 tests). No
threshold, exclusion or `v8 ignore` was added.

## Blockers

Unresolved, pre-existing, not caused by this change:

- `test/internal-only.test.ts` cases C and D (`expected 200 to be 400`): ADR
  0007 external rejection, explicitly out of scope here. Same two failures
  before and after.
- `pnpm audit`: GHSA-wq5f-xc86-pv6w (high, `sharp` < 0.35.5, resolved 0.35.4)
  via `miniflare` and `wrangler>miniflare`. Development toolchain only; not in
  the Worker bundle. No ignore or override was added.

Resolved here: `env`-identity app cache; outage negative masking a warm keyset;
shared negative map.

Recorded only, need coordinated Jump + Rails work (see
`docs/compatibility.md`): `typ: JWT` explicit typing; WHATWG vs Rack query
parser differential, with its test matrix.

## Hono advisory disposition

Source: GitHub advisory database, `gh api /advisories?ecosystem=npm&affects=…`,
queried 2026-10-07. `affects=hono@4.13.12`, `@hono/node-server@2.1.3` and
`jose@6.2.12` each returned 0 advisories. The unpinned `affects=hono` listing returned 55 advisories; every vulnerable
range ends below 4.13.7 or earlier (four are withdrawn duplicates with no patched
version field). No dependency was updated.

Hono APIs in `src/`: `Hono`, `Context`, `hono/language` `languageDetector`,
`hono/logger`, `hono/trailing-slash`, `hono/secure-headers`, `hono/jsx` (types),
`hono/jsx/dom/server` `renderToString`, `hono/html` `raw`.

| Advisory            | Subject                        | Disposition                                  |
| ------------------- | ------------------------------ | -------------------------------------------- |
| GHSA-hxh3-vqpv-xpqv | JSX boundary component escape  | patched (< 4.13.7); no boundary components   |
| GHSA-hvrm-45r6-mjfj | JSX context isolation          | patched (< 4.12.27); no JSX context used     |
| GHSA-54fx-42gc-7vw4 | `languageDetector` complexity  | patched (< 4.12.34); API is used             |
| GHSA-crvj-82cr-hjcx | query parser after fragment    | patched (< 4.13.5); `c.req.query('rt')` used |
| GHSA-g6gw-c38x-mqfc | `parseBody({ dot: true })`     | patched; N/A, no body parsing                |
| GHSA-f23p-vx2j-j53r | `memo()`                       | patched; N/A, not used                       |
| GHSA-w62v-xxxg-mg59 | `cx()`                         | patched; N/A, not used                       |
| GHSA-5r4p-p66f-jhc7 | `serveStatic`                  | unknown: ID returns 404 in the database      |
| JWT/JWK middleware  | f67f-6cw9-8mq4, 3vhc-576x-3qv4 | patched; N/A, `hono/jwt`/`hono/jwk` not used |

`serveStatic`, CORS, Proxy, cookie, cache, body-limit, IP restriction, SSG and
adapter advisories are N/A: none of those modules is imported, and every such
advisory in the list is also patched below 4.13.12. `serveStatic` advisories
that do resolve (GHSA-q5qw-h33p-qvwr, wmmm-f939-6g9c, wwfh-h76j-fc44) are
patched and N/A.

`raw()` has three call sites in `src/core/page.tsx`, fed only by the module
constants `SPLASH_INLINE_SCRIPT`, `CUSHION_INLINE_SCRIPT`, `PRODUCT_PAGE_CSS`
and `SPLASH_PAGE_CSS` from `src/core/security_headers.ts`, whose hashes are in
the CSP. No request, token or destination value reaches `raw()`.

## App and JWKS cache lifetime

Before: `WeakMap<env, app>`; each new `env` reference built a new app and
refetched issuer JWKS. After: one module-scope entry reused only when the
canonical service origin and Worker version of the current request match. The
entry holds the static registry and public issuer keysets; signer and published
JWKS still come from the request's `env`, and the secret-derived key material
cache stays `env`-keyed. Chosen over a keyed map because one deployment has one
origin, so a single entry is the smallest bound.

RED: `test/cloudflare-app-cache.test.ts` with a new `env` object per request,
`expected "vi.fn()" to be called 1 times, but got 2 times` (two tests). GREEN
after the change; origin change, version change and per-request signing
material are covered. `test/jump.test.ts` "warm isolate" was updated from the
old `env`-identity expectation.

workerd: three signed requests in one runtime instance made exactly one issuer
JWKS fetch. Observed `signer imports=1`, so this workerd build handed over a
stable `env` reference; the runtime test would therefore also have passed
before the change and is a regression pin, not the RED. Latency 6/3/2 ms, far
inside the 1000 ms deadline.

## JWKS availability semantics

Before: an issuer outage negative was checked first and answered 503 for every
request of that issuer for 30 s, including ones a warm keyset could verify; it
shared one 1024-entry map with unknown-kid entries. After: see
`docs/architecture.md`. TTLs, cooldown, single-flight and bounds are unchanged.

RED in `test/jwks-availability.test.ts` (4 of 17): valid token after a failed
forced refresh (503 instead of 302), known kid after a failed unknown-kid
refresh, warm TTL boundary, and an unknown-kid flood on one issuer evicting
another issuer's outage entry (fetch count 2 instead of 1). GREEN after the
change. Also pinned: refresh-dependent requests stay 503 without extra fetches,
cold cache 503, negative and keyset TTL at −1/0, recovery, revocation over warm
and outage state with no fetch, rotation, cooldown at −1/0, single-flight for
success and failure, late fetch after abort, no late acceptance log.

## Fetch Metadata

Policy and rationale: `docs/security.md`. Sources read this session: Fetch
Standard (Last Updated 6 October 2026) for modes and destinations; Fetch
Metadata Request Headers (W3C Working Draft, 21 September 2026) for token
syntax and "SHOULD ignore this header if it contains an invalid value";
Prerendering Revamped (27 August 2026) for `prefetch` with a `prerender`
parameter. No legacy purpose header was added, for lack of a primary source.

RED: `test/fetch-metadata.test.ts` against a no-op stub, 90 failures. Two more
were faults in the new tests themselves and were corrected. GREEN after
implementation: 32 accepted and 43 rejected header partitions on GET and HEAD,
public shape identical to a malformed token, audit entry without request data,
precedence of method/query validation, ten unaffected routes, and behind the
adapter: limiter still called, limiter 429 wins, zero JWKS fetch, no signer
log.

Finding: Node's `fetch` (undici 7.29) always sets `Sec-Fetch-Mode: cors`. The
existing workerd suite went 400 for that reason until the harness wrapper
dropped that artifact and mapped `X-Test-Sec-*` to the headers under test.
Server-side Node callers of `/?rt=` are refused like a browser `fetch()`.

## RFC 8725bis

Latest revision per the IETF datatracker is `-10` (2026-08-21, RFC Editor
queue). `test/jwt-bcp-regression.test.ts` adds 110 pins; all passed on first
run, so no gap in current behavior was found and no runtime code changed.

## workerd acceptance

`pnpm run test:worker`, exit 0: 20 signed edges; JWKS reuse; Fetch Metadata
rejection (fetch, iframe, prefetch, prerender; GET and HEAD) with zero JWKS
fetch and no signer log; navigation 302 with verified outbound token; HEAD
parity; security headers; no Set-Cookie; no token, query or raw metadata in
logs; 504 for an issuer JWKS slower than the deadline with no late
`jump_accept`.

## Not verified

Real browser prefetch/prerender against a deployed Worker; production `env`
identity behavior; Rails receiver behavior. Chromium e2e ran against the Node
server only.
