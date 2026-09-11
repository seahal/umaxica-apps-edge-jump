# Cloudflare hardening — independent audit of the Codex implementation

## Context

Codex implemented the Cloudflare hardening described in `plans/jump-cloudflare-hardening.md`.
This document is an independent verification of that work against the confirmed design
decisions, the installed dependency sources (hono 4.13.3, jose 6.2.10, wrangler 4.125.x),
and the actual working tree — not against Codex's own description or test-pass report.

Sections A–F are the audit as it stood before any change: no files were modified while producing
them, and the verdict there was NO-GO. Section G was the proposed remediation, and section H records
what was applied after approval and re-verified. Read A–F as the finding of fact and H as the
current state.

---

## A. Baseline

| Item                   | Value                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| Branch                 | `develop` (`origin/develop`, ahead 1)                                                                   |
| HEAD                   | `abb80c97dd4cd5f9a868f438e3c8d3d745b1a8c1` — **unchanged** from the stated baseline                     |
| Baseline used          | HEAD (`abb80c9`). Codex committed nothing; the entire implementation is uncommitted working-tree state. |
| merge-base with `main` | `0499f645f3115c4b46505b2c327d34a7e0c03fea`                                                              |
| Working tree           | 34 modified, 1 deleted (`vite.config.ts`), 4 untracked                                                  |

Baseline confidence is **high**: `git reflog` shows no commits after `abb80c9`, so
`git diff` against HEAD is exactly the total change set under review. There is no need to
guess a baseline commit.

### Change classification

| Class                     | Files                                                                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare hardening      | `src/cloudflare.ts`, `src/index.ts`, `src/core/{fetch_jwks,handle_jump,jwks_cache,policy,types,verify_jwt}.ts`, `src/config/registry.umaxica.ts`, `src/config/registry.example.ts`, `wrangler.jsonc` |
| Tests                     | `test/jump.test.ts`, `vitest.config.ts`, `playwright.config.ts`                                                                                                                                      |
| CI                        | `.github/workflows/integration.yaml`                                                                                                                                                                 |
| Docs                      | `README.md`, `AGENTS.md`, `adr/0002-*`, `docs/**`, `plans/stateless-crafting-fox.md`, `plans/jump-cloudflare-hardening.md` (new)                                                                     |
| Toolchain / user-owned    | `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `knip.json`, `Dockerfile`, `compose.yaml`, `vite.config.ts` (deleted), `.oxfmtrc.json`, `.oxlintrc.json`, `.oxfmtignore`          |
| **Fastly / out of scope** | **`fastly.toml` (modified)**                                                                                                                                                                         |

### Fastly change status: **NOT CLEAN**

`src/fastly.ts` is byte-identical to baseline (verified: `git diff src/fastly.ts` is empty).
However `fastly.toml` **was modified** — the `[scripts] build` line dropped the `vp exec`
prefixes:

```
-build = "... vp exec esbuild ... && vp exec js-compute-runtime ..."
+build = "... esbuild ... && js-compute-runtime ..."
```

This is a consequence of the repo-wide Vite+ removal (`AGENTS.md` forbids Vite+), not of
Cloudflare hardening, so its _intent_ is defensible. It is still a Fastly-config change
inside a "do not touch Fastly" scope and must be acknowledged rather than discovered later.
Its correctness is unverified: `esbuild` is now a direct devDependency (so `pnpm exec`
resolution works), but `js-compute-runtime` resolves only via `@fastly/js-compute`'s bin,
and `fastly compute build` does not necessarily run the script through pnpm's bin PATH.
**Not verified — Fastly build was not run, per scope.**

---

## B. Decision compliance

Evidence is `path:line`. "TEST" names a test in `test/jump.test.ts` that actually asserts it.

| Contract                                                                                    | Verdict                                     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token is redirect-decision-only; no identity/secret in claims                               | PASS                                        | `src/core/types.ts:45-57` — outbound claim set is `schema/iss/aud/sub/iat/nbf/exp/jti/src/dst/url` only. `src/core/handle_jump.ts:140-152`.                                                                                                                                                                                                                                                                   |
| No `src_jti`; schema 1 retained                                                             | PASS                                        | `src/core/types.ts:46,53-56`; no `src_jti` anywhere (`grep`).                                                                                                                                                                                                                                                                                                                                                 |
| Replay allowed within `exp`; no single-use tracking on Cloudflare                           | PASS (prod) / **PARTIAL (default)**         | `src/cloudflare.ts:69` uses `NoopReplayCache`. But `src/index.ts:51` defaults to `MemoryReplayCache` (`src/core/replay_cache.ts:7-26`), which _does_ enforce single-use. See F-9. TEST `replay cache rejects repeated jti when enabled`.                                                                                                                                                                      |
| Stateless: no DB/KV/DO/Cache API                                                            | PASS                                        | `grep -rn "caches\.\|KVNamespace\|DurableObject\|D1Database" src/` → no matches.                                                                                                                                                                                                                                                                                                                              |
| Isolate-local cache allowed as perf only; cache loss must not change the decision           | PASS by design, **NOT VERIFIED at runtime** | `JwksCache` (`src/core/jwks_cache.ts:16-28`) and `CloudflareKeyMaterialCache` (`src/cloudflare.ts:170`) are pure memoization; every miss re-fetches and re-derives. But see F-4: whether they survive across requests at all is unproven.                                                                                                                                                                     |
| Input TTL: `exp - iat <= 300`, no skew added                                                | PASS                                        | `src/core/verify_jwt.ts:15,155-156` — bare `> MAX_INBOUND_TTL_SECONDS`, no skew term. TEST `input ttl accepts 300 seconds and rejects 301 seconds`.                                                                                                                                                                                                                                                           |
| Output TTL: `exp = iat + 30` exactly                                                        | PASS (code) / **test gap**                  | `src/core/handle_jump.ts:36,139,145-147` — `iat: now`, `exp: now + 30`. No test asserts `exp - iat === 30`; TEST `internal redirect carries outbound rt signed by jump` checks payload fields but not the TTL. See E-5.                                                                                                                                                                                       |
| Max clock skew 5s, applied only vs. now, never doubled                                      | PASS                                        | `src/core/verify_jwt.ts:14` — the single constant feeds jose `clockTolerance` (`:67,82`) and the local `now`-relative checks (`:149-152`). The structural TTL check at `:155` has no skew term. TEST `skew handling permits recently expired token`, `clock skew rejects values beyond five seconds`.                                                                                                         |
| `allowed_dst_external: false \| readonly string[]`; `true` forbidden                        | PASS                                        | Type: `src/core/types.ts:24`. Runtime: `src/index.ts:343-344` rejects anything that is neither `false` nor an array.                                                                                                                                                                                                                                                                                          |
| External allowlist = HTTPS exact origins only; no wildcard/suffix/regex                     | PASS                                        | `src/index.ts:345-361` (origin-shape validation at startup); `src/core/policy.ts:27-29` compares full normalized origins with `===`. TEST `origin policy treats equivalent host spellings and default ports as the same origin`, `non-default ports reject in production registries`.                                                                                                                         |
| Canonical issuers = exactly the 6 approved                                                  | PASS                                        | `src/config/registry.umaxica.ts:3-46`. No `id.*`, `www.jp.*`, `jpx.*`, no Core issuer. TEST `umaxica production registry limits issuers and internal destinations`.                                                                                                                                                                                                                                           |
| `jwks_uri` = `{issuer}/.well-known/jwks.json`                                               | PASS                                        | `registry.umaxica.ts` (all 6) and enforced at fetch time by `src/core/fetch_jwks.ts:57-69` (same-origin, exact path, no port/userinfo/query/fragment).                                                                                                                                                                                                                                                        |
| Internal destination matrix; no cross-TLD; no self-origin                                   | PASS                                        | `registry.umaxica.ts:7,13,21,28,35,42` match the approved matrix exactly. Self-link blocked at `src/core/normalize_url.ts:40-41`.                                                                                                                                                                                                                                                                             |
| Production/dev registries separated                                                         | PASS                                        | `registry.umaxica.ts` (prod) vs `src/config/registry.example.ts` (example); `src/index.ts:339-340,350-351` reject non-HTTPS when `runtime.production`.                                                                                                                                                                                                                                                        |
| `revoked_kids` evaluated even on cache hit                                                  | PASS                                        | `src/core/jwks_cache.ts:38` — checked at the top of `getKey`, **before** any cache lookup, so a hit cannot bypass it. TEST `jwks cache rejects revoked and negative cached kids`.                                                                                                                                                                                                                             |
| Active/revoked kid collision rejected at config time                                        | **FAIL**                                    | No such check exists. `validateRegistry` (`src/index.ts:335-363`) never inspects `revoked_kids`. A kid may be simultaneously live in the issuer JWKS and listed as revoked; the denylist wins at runtime (safe), but the misconfiguration is silent. See F-7.                                                                                                                                                 |
| Single 1s deadline from handler start                                                       | PASS (structure)                            | `src/index.ts:75` (`deadlineMs ?? 1000`), `:249-260` — one `AbortController` per request, set before routing, shared via `c.get('deadlineSignal')`.                                                                                                                                                                                                                                                           |
| Same remaining time shared by first fetch and forced refresh                                | PASS (structure)                            | The same `signal` threads `verifyJumpJwt(:60,:75)` → `jwksCache.getKey` → `getJwks` → `fetchAndCache` → `fetch`. No new timer is created on retry.                                                                                                                                                                                                                                                            |
| AbortSignal reaches the real `fetch()`                                                      | PASS                                        | `src/core/fetch_jwks.ts:11-15` — `...(signal ? { signal } : {})`.                                                                                                                                                                                                                                                                                                                                             |
| Not relying on Hono `timeout()` alone                                                       | PASS                                        | Hono's `timeout()` is not used at all; a custom controller + `raceWithDeadline` (`src/index.ts:262-277`) is used.                                                                                                                                                                                                                                                                                             |
| Abort classified as 504                                                                     | PASS (code)                                 | `fetch_jwks.ts:43-45` and `jwks_cache.ts:107-118` map abort → `deadline_exceeded`; `index.ts:322` maps it to 504. **Untested.**                                                                                                                                                                                                                                                                               |
| No background work / unhandled rejection after the deadline                                 | **PARTIAL**                                 | `raceWithDeadline` (`index.ts:268-276`) attaches a rejection handler, so no unhandled rejection. But the in-flight `handleJump` promise is _not_ cancelled — it continues until its own abort checks fire, and `JwksCache.inFlight`/`cache` writes can still land after the 504 is returned (`jwks_cache.ts:94,102`). Benign (isolate-local, idempotent) but not the stated "leaves nothing behind". See F-5. |
| 400 for malformed / missing / duplicate `rt` / bad claim / revoked kid / expired            | PASS                                        | `handle_jump.ts:59-64` (unknown param, count≠1, empty), `:118-123` default 400; `verify_jwt.ts` throws `malformed`/`invalid_*`/`expired`; revoked → `invalid_signature` → 400. Verified empirically: `/?rt=a&rt=b` → 400, `/?rt=a&x=1` → 400.                                                                                                                                                                 |
| 410 not used for expiry                                                                     | PASS                                        | `grep 410 src/` → no matches; `expired` → 400 (`handle_jump.ts:118-123`).                                                                                                                                                                                                                                                                                                                                     |
| 405 with `Allow: GET, HEAD`                                                                 | PASS                                        | `src/index.ts:113-120`. Verified empirically: `POST /` → 405.                                                                                                                                                                                                                                                                                                                                                 |
| 429 for rate limit                                                                          | PASS                                        | `src/cloudflare.ts:111-119`. TEST `cloudflare rate limit response is HTML with a contract title`.                                                                                                                                                                                                                                                                                                             |
| 502 for bad JWKS / content-type / size / redirect / protocol                                | PASS (code)                                 | `fetch_jwks.ts:20,25,29,37,39` → `jwks_bad_gateway`; `index.ts:320` → 502. Negative paths **untested** (E-4).                                                                                                                                                                                                                                                                                                 |
| 503 for upstream 5xx / DNS / signer unavailable                                             | PASS                                        | `fetch_jwks.ts:17-19,46`; `index.ts:321`. TEST `signer unavailable maps to 503 for internal redirects`.                                                                                                                                                                                                                                                                                                       |
| 504 for deadline                                                                            | PASS (code), **untested**                   | `index.ts:279-288,322`.                                                                                                                                                                                                                                                                                                                                                                                       |
| 500 only for unclassified faults                                                            | PASS                                        | `index.ts:161,324`; `handle_jump.ts:100,122`.                                                                                                                                                                                                                                                                                                                                                                 |
| GET/HEAD only for jump; exactly one `rt`                                                    | PASS                                        | `index.ts:78` registers `['GET','HEAD']`; everything else → 405 at `:113`.                                                                                                                                                                                                                                                                                                                                    |
| GET and HEAD agree on status/Location/headers; HEAD body empty                              | PASS                                        | `index.ts:110` `withoutBody()` preserves status + headers. TEST `HEAD jump matches GET status, location, and security headers without a body`. Verified empirically that Hono 4.13 also auto-serves HEAD for `app.get` routes (`HEAD /about` → 200, `HEAD /health` → 200).                                                                                                                                    |
| `rt`-less info page preserved                                                               | PASS                                        | `index.ts:79` → `/about` redirect. TEST `GET / redirects to about when rt is absent`.                                                                                                                                                                                                                                                                                                                         |
| Rate limits: jump 120/60, jwks 600/60, info 300/60, assets none                             | PASS (config)                               | `wrangler.jsonc:22-42` (120/600/300 over 60s); route split `src/cloudflare.ts:91-126`; assets short-circuit _before_ the limiter at `:47-49`. Binding selection **untested** (E-3).                                                                                                                                                                                                                           |
| Key = provider-determined client IP; no user-supplied header                                | PASS                                        | `src/cloudflare.ts:101` uses `CF-Connecting-IP` only. No `X-Forwarded-For` anywhere (`grep`). But **fails open** when the header is absent — see F-8.                                                                                                                                                                                                                                                         |
| Request ID generated internally, never reflected from input                                 | PASS                                        | `src/index.ts:240-247` — `crypto.randomUUID()`, incoming `X-Request-ID` never read (`grep` confirms no read).                                                                                                                                                                                                                                                                                                 |
| Cloudflare Ray ID in a separate `cf_ray` field                                              | PASS                                        | `src/index.ts:365-367`, `src/core/handle_jump.ts:50`.                                                                                                                                                                                                                                                                                                                                                         |
| Audit log records only the allowed fields                                                   | PASS                                        | `src/core/handle_jump.ts:40-53` — the type admits only `level/event/result/reason/iss/kid/dst/dst_origin/request_id/cf_ray/status/latency_ms`. No token, URL, path, query, jti, hash, IP, Referer, UA, Cookie. TEST `decision audit logs omit rt while keeping verification fields`, `decision audit logs rejected token metadata without full jwt`.                                                          |
| Hono request log does not record `rt`                                                       | PASS                                        | `src/index.ts:221-233` reduces the request target to `url.pathname`. TEST `request logs redact rt tokens`.                                                                                                                                                                                                                                                                                                    |
| **Cloudflare invocation logs do not record `rt`**                                           | **FAIL**                                    | `wrangler.jsonc:71` sets `"invocation_logs": true`. Cloudflare invocation logs capture the request URL including the query string — i.e. the full inbound JWT — outside the application logger's control. See **F-3**.                                                                                                                                                                                        |
| 30-day raw-log retention declared                                                           | **EXTERNAL BLOCKER**                        | Not expressible in `wrangler.jsonc`; `observability.logs.persist: true` uses the account's Workers Logs retention. Must be confirmed as an operational precondition. See F-10.                                                                                                                                                                                                                                |
| Worker-first static assets; security headers on assets, miss, 404, HEAD, timeout, exception | PASS                                        | `wrangler.jsonc:6-10` (`run_worker_first: true` — confirmed valid against the installed `node_modules/wrangler/config-schema.json`: `Assets.run_worker_first` accepts `boolean`). Headers forced at `src/cloudflare.ts:136-146`. Verified empirically that 404 / 405 / 400 / 503 / onError responses all carry CSP + HSTS + `no-store` + XFO + `X-Request-ID`.                                                |
| Assets skip rate limiting                                                                   | PASS                                        | `src/cloudflare.ts:47-49` returns before `checkRateLimit`. **Untested** (E-3).                                                                                                                                                                                                                                                                                                                                |
| Asset binding does not recurse                                                              | PASS                                        | With `run_worker_first: true`, `env.ASSETS.fetch()` addresses the Asset Worker directly, not the User Worker. TEST `cloudflare worker serves favicon without importing private key`.                                                                                                                                                                                                                          |
| CI has no non-existent directory matrix                                                     | PASS                                        | `.github/workflows/integration.yaml` — no `strategy.matrix` anywhere.                                                                                                                                                                                                                                                                                                                                         |
| CI runs only scripts that exist                                                             | PASS (existence) / **FAIL (executability)** | Every referenced script exists in `package.json`, but `lint:check` and `format:check` **fail locally and will fail identically in CI**. See **F-2** and **F-5**.                                                                                                                                                                                                                                              |
| Fastly not a required check                                                                 | PASS                                        | No Fastly job in the workflow.                                                                                                                                                                                                                                                                                                                                                                                |
| pnpm/Node version contract matches the repo                                                 | PARTIAL                                     | CI pins pnpm `10.29.3` + Node `24`. `package.json` has neither `packageManager` (deliberately removed — Corepack is forbidden) nor `engines`, and `.npmrc` dropped `engine-strict=true`. Nothing in-repo pins the local toolchain. See F-11.                                                                                                                                                                  |
| Rollout order / T0                                                                          | EXTERNAL BLOCKER                            | Documentation-only; the code is additive-ready (registry is a plain map). Not verifiable here.                                                                                                                                                                                                                                                                                                                |

---

## C. Findings

### P0

None found. Specifically ruled out, with the method used:

- **Private key exfiltration** — `stripPrivateJwkFields` (`src/cloudflare.ts:360-366`) removes `d,p,q,dp,dq,qi,oth,k` before publishing; `test/jump.test.ts:846` (`configured Jump jwks rejects private key material`) covers the configured path. `grep` confirms no log statement takes the PEM or a JWK; all signer logs emit only booleans, `kid`, and error _names_ (`:379-476`).
- **Open redirect** — every destination must survive `normalizeUrl` (scheme/userinfo/self/private-IP/metadata) **and** an exact-origin `===` match against the issuer's allowlist (`src/core/policy.ts:27-29`). No prefix, suffix, or wildcard comparison exists in the file.
- **Algorithm confusion** — `alg` is pinned to `ES384` at three layers: header allowlist (`verify_jwt.ts:12,44`), jose `algorithms: [header.alg]` after that allowlist (`:65,80`), and jose's own `ES384 → {name:'ECDSA', namedCurve:'P-384'}` binding (verified in `node_modules/jose/.../lib/jws_algorithms.js:58-59`), which makes WebCrypto reject a P-256 key presented as ES384. `crit`/`jku`/`jwk`/`x5u` are rejected outright (`:49-51`). TEST `none algorithm token rejects`, `wrong elliptic curve key rejects for ES384`, `jku reject`, `crit, jwk, and x5u headers reject`.
- **Unverified-claim trust** — only `iss` is read pre-verification, and solely to select a registry entry (`verify_jwt.ts:53-56`); every other claim is read from jose's verified payload (`:93`).

### P1

**F-1 — Supply-chain hardening was silently removed from `.npmrc` (out of scope).**
_Fact:_ `.npmrc` went from five hardening directives to one:

```
-registry=https://npm.flatt.tech/     -engine-strict=true
-ignore-scripts=true                  -audit=true          -min-release-age=1
+manage-package-manager-versions=false
```

_Impact:_ `ignore-scripts=true` was the control preventing arbitrary `postinstall` execution from any transitive dependency; it is now off. The pinned private registry is gone, so the whole graph now resolves from public npm — consistent with the 1400-line `pnpm-lock.yaml` rewrite. This is the highest-impact change in the diff and it is **not Cloudflare hardening**.
_Repro:_ `git diff .npmrc`; `git diff --stat pnpm-lock.yaml`.
_Path:_ `.npmrc:1`.
_Mitigation present:_ `pnpm-workspace.yaml` retains `minimumReleaseAge: 4320` and adds `allowBuilds: {esbuild: false, workerd: false}` — narrower than a blanket `ignore-scripts`.
_Minimal fix:_ restore `ignore-scripts=true` and the registry line, or obtain an explicit decision that this was intended. Confirm whether the registry removal was the user's own change or Codex's — **origin unknown**; `.npmrc` was not in the user's declared pre-existing set (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`).
_Fixable in Jump:_ yes, but it is a user/policy decision, not a defect to patch unilaterally.

**F-2 — `pnpm run lint:check` cannot execute; the CI `quality` job will fail.**
_Fact:_ `oxlint --type-aware` aborts with `Failed to find tsgolint executable. You may need to add the 'oxlint-tsgolint' package to your project?` (exit 1). `oxlint-tsgolint` is absent from `package.json`.
_Impact:_ CI is red on every push. Per the stated criteria this alone forces NO-GO. Type-aware lint rules have never actually run against this implementation.
_Repro:_ `pnpm run lint:check` → exit 1.
_Path:_ `package.json:16` (`"lint:check": "oxlint --type-aware ."`), `.github/workflows/integration.yaml:29`.
_Minimal fix:_ add `oxlint-tsgolint` to `devDependencies` (matching `oxlint@1.77.0`), or drop `--type-aware`. Prefer adding the package — the source contains `eslint-disable` comments implying lint was expected to run.
_Fixable in Jump:_ yes.

**F-3 — Cloudflare invocation logs capture the full request URL, including the `rt` JWT.**
_Fact:_ `wrangler.jsonc:71` enables `"invocation_logs": true` with `persist: true` and `head_sampling_rate: 1`. Cloudflare invocation logs are emitted by the runtime and record request metadata including the URL query string. The application logger's redaction (`src/index.ts:221-233`) has no effect on them.
_Impact:_ Every inbound token — and therefore every destination URL — is written verbatim to persisted Workers Logs at 100% sampling. This violates the explicit prohibitions on logging the JWT/`rt` and the full request URL, and F-10's 30-day retention then applies to raw tokens.
_Repro:_ deploy and inspect the invocation log line for `GET /?rt=<jwt>`; the URL is unredacted. (Not executed here — no deploy in scope.)
_Path:_ `wrangler.jsonc:71`.
_Docs:_ Cloudflare Workers Logs / `observability.logs.invocation_logs`.
_Minimal fix:_ set `"invocation_logs": false`, keeping `logs.enabled: true` so the redacted structured `console.log` output is retained.
_Needed test:_ config assertion that `wrangler.jsonc` has `invocation_logs !== true` (a JSON read in the existing test file, alongside the `public/_headers` test at `test/jump.test.ts:2290`).
_Fixable in Jump:_ yes — one line.

**F-4 — Cross-request reuse of the app, JWKS cache, and key material is unproven and may be zero.**
_Fact:_ `src/cloudflare.ts:41` memoizes the app in `new WeakMap<object, ...>()` keyed on the `env` object, populated in `getApp` (`:55-77`). Both `JwksCache` and `CloudflareKeyMaterialCache` live only inside that entry. Nothing in the code or the test suite establishes that workerd passes the _same_ `env` object reference to successive `fetch()` invocations in one isolate. The test suite constructs a fresh env object per case and runs in Node, not workerd (`vitest.config.ts`; no `@cloudflare/vitest-pool-workers` dependency).
_Impact:_ If `env` is per-request, every single request re-imports the PKCS8 key, re-derives the public JWKS, performs a probe sign **and** verify (`assertPrivateKeyMatchesPublicJwk`, `:344-358`), and re-fetches the issuer JWKS over the network. At the configured 120 rps that is 120 upstream JWKS fetches/second against a 1-second total deadline — a latency and upstream-load failure, and likely self-inflicted rate limiting by the issuer. The security decision stays correct (the caches are pure memoization), so this is availability/performance, not correctness.
_Repro:_ not reproducible in Node. Requires `wrangler dev --local` (or `@cloudflare/vitest-pool-workers`) issuing two requests and counting `fetch` calls / `jump_signer_configured` log lines.
_Path:_ `src/cloudflare.ts:41,55-77,170-211`.
_Docs:_ Cloudflare Workers execution model (isolate reuse, module-scope lifetime).
_Minimal fix:_ neither the Hono app, `JwksCache`, nor `CloudflareKeyMaterialCache` depends on `env` for construction except `serviceOrigin` (a static `var`). Replace the `WeakMap<env>` with a plain module-level singleton (`let app: ReturnType<typeof createApp> | undefined`), which is correct regardless of how workerd handles `env`. Keep the existing `signerForRequest`/`jumpJwksForRequest` closures — they already defer all per-request env access.
_Needed test:_ two sequential `worker.fetch()` calls through the default export, asserting exactly one upstream JWKS fetch and one signer import.
_Fixable in Jump:_ yes.

**F-5 — `pnpm run format:check` fails on `knip.json`; same CI job as F-2.**
_Fact:_ `oxfmt . --check` reports `Format issues found in above 1 files` → `knip.json`, exit 1. `knip.json` is a file Codex modified.
_Impact:_ CI `quality` job red (second independent cause). Contradicts any report that the handoff checks pass.
_Repro:_ `pnpm run format:check` → exit 1.
_Path:_ `knip.json`, `.github/workflows/integration.yaml:28`.
_Minimal fix:_ `pnpm run format` (deferred — it rewrites a file).
_Fixable in Jump:_ yes, trivially.

### P2

**F-6 — Issuer JWKS schema validation is far weaker than the contract requires.**
_Fact:_ `isJwks` (`src/core/fetch_jwks.ts:72-76`) accepts _any_ object with a `keys` array of objects. There is no validation of `kty`, `crv`, `use: 'sig'`, `alg`, or `kid`; no rejection of private material (`d`); and no duplicate-`kid` rejection — `jwks_cache.ts:47` uses `find()`, which silently takes the first match. The existing test proves how loose this is: the mock returns `{keys:[{kid:'kid-1'}]}` — no `kty`, no `crv` — and is accepted (`test/jump.test.ts:272-280`).
_Impact:_ Defense-in-depth only. jose blocks the exploitable cases at import time: `ES384` is bound to `namedCurve: 'P-384'` (`jose/.../jws_algorithms.js:59`), so a curve-substituted key fails `subtle.importKey`; a private JWK imports with `['sign']` usages (`jose/.../jwk_to_key.js`) and then fails verification. A `use: 'enc'` key, however, _would_ be accepted for signature verification, because `jwk_to_key.js` deletes `use` before import. Requires issuer compromise to reach.
_Repro:_ the cited test itself demonstrates acceptance of a structurally invalid JWK.
_Path:_ `src/core/fetch_jwks.ts:72-76`; `src/core/jwks_cache.ts:47`.
_Docs:_ RFC 7517 §4 (`use`, `key_ops`, `kid`), RFC 7518 §6.2.
_Minimal fix:_ in `isJwks`, require each key to have `kty === 'EC'`, `crv === 'P-384'`, `alg === 'ES384'`, a non-empty string `kid`, `use` absent or `'sig'`, and no private field (`d`); reject the whole set on a duplicate `kid`. Classify failures as `jwks_bad_gateway` (502), which the existing mapping already does.
_Needed tests:_ duplicate kid; private `d` present; `use: 'enc'`; wrong `crv`; missing `kty`.
_Fixable in Jump:_ yes.

**F-7 — Active/revoked kid collision is not rejected at configuration time.**
_Fact:_ The contract requires rejecting a configuration where a kid is both active and revoked. `validateRegistry` (`src/index.ts:335-363`) never reads `revoked_kids`, and the registry ships `revoked_kids: []` for all six issuers.
_Impact:_ Runtime is fail-safe — `jwks_cache.ts:38` denies a revoked kid before any cache or fetch, so the denylist always wins. The gap is that a bad emergency revocation entry (typo, stale kid) is never surfaced. Low severity today because every list is empty.
_Path:_ `src/index.ts:335-363`; `src/config/registry.umaxica.ts:9,16,23,30,37,44`.
_Minimal fix:_ a startup check is only meaningful against the live JWKS, which is not available at construction time. Instead reject duplicates _within_ `revoked_kids` and require non-empty string entries, and add a runtime audit field when a revoked kid is hit (`jwks_cache.ts:38`) so an emergency revocation is observable.
_Fixable in Jump:_ yes.

**F-8 — Rate limiting fails open when `CF-Connecting-IP` is absent.**
_Fact:_ `src/cloudflare.ts:101-102` — `if (!clientIp) return null;` skips the limiter entirely.
_Impact:_ Cloudflare sets `CF-Connecting-IP` on all edge-routed traffic, so this should be unreachable in production behind the configured custom domain. It is nonetheless an unbounded-request path if the header is ever missing, and the choice is silent — no log, no metric.
_Path:_ `src/cloudflare.ts:101-102`.
_Docs:_ Cloudflare Workers Rate Limiting binding; `CF-Connecting-IP` request header.
_Minimal fix:_ keep failing open (availability over enforcement is the right call for a redirect service, and the binding is explicitly not an authorization control), but emit an audit line so the condition is visible. Alternatively key on `request.cf?.colo` as a coarse fallback.
_Needed test:_ a request with no `CF-Connecting-IP` does not call `limit()` and still returns a normal response.
_Fixable in Jump:_ yes.

**F-9 — The default `replayCache` contradicts the confirmed "replay allowed within `exp`" decision.**
_Fact:_ `src/index.ts:51` defaults to `MemoryReplayCache`, which throws `JumpError('replay')` on a repeated `jti` (`src/core/replay_cache.ts:11-16`). `errorStatus` has no `'replay'` branch, so it falls through to 400 (`src/index.ts:324`, `handle_jump.ts:123`).
_Impact:_ Cloudflare is safe — `src/cloudflare.ts:69` overrides with `NoopReplayCache`. But the default makes a redirect decision depend on isolate-local state, which is exactly what the stateless contract forbids: the same token gets 302 on a cold isolate and 400 on a warm one. Any future entrypoint that forgets the override inherits the wrong behavior.
_Path:_ `src/index.ts:51`; `src/core/replay_cache.ts:7-26`.
_Minimal fix:_ make `NoopReplayCache` the default and let tests opt in to `MemoryReplayCache` explicitly (TEST `replay cache rejects repeated jti when enabled` already passes it in deliberately). Per YAGNI, consider deleting `MemoryReplayCache` and the `replay` error code outright.
_Fixable in Jump:_ yes.

**F-10 — 30-day raw-log retention is not expressible in the repo.**
_Fact:_ `wrangler.jsonc:65-73` sets `observability.logs.persist: true`; retention is an account-level Workers Logs setting, not a Worker config field (confirmed against the installed `wrangler` config schema).
_Impact:_ The contractual 30-day retention is an unverifiable operational assumption.
_Minimal fix:_ record it as an explicit operational precondition in `docs/logging.md` and treat it as a rollout gate. Interacts directly with F-3: until `invocation_logs` is disabled, this retention applies to raw JWTs.
_Fixable in Jump:_ no — **external/operational blocker**.

**F-11 — `trimTrailingSlash` 301-redirects `//?rt=<jwt>`, reflecting the token in `Location`.**
_Fact:_ Empirically, `GET //?rt=abc` → **301** with `Location: /?rt=abc`; likewise `///`. (`src/index.ts:76`.)
_Impact:_ 301 is not in the contract's status set for the jump path, and the response reflects the full JWT into a `Location` header on an unauthenticated route. `responseHygiene` sets `Cache-Control: no-store` (`security_headers.ts:87`), which suppresses the otherwise-default cacheability of a 301 — so the practical risk is low. There is **no** rate-limit bypass: `rateLimitRoute` classifies `//` as `info` (300/60), but the client must follow the redirect to `/`, which is then jump-limited (120/60).
_Repro:_ `app.fetch(new Request('https://jump.umaxica.net//?rt=abc'))` → 301.
_Path:_ `src/index.ts:76`; `src/cloudflare.ts:122-126`.
_Docs:_ RFC 9110 §15.4.2 (301 semantics/cacheability).
_Minimal fix:_ scope `trimTrailingSlash()` to the informational routes, or 400 on any jump path that is not exactly `/`.
_Needed test:_ `//?rt=…` and `/about/` status assertions.
_Fixable in Jump:_ yes.

**F-12 — Out-of-scope `fastly.toml` modification.** See section A. Report only; do not "fix" and do not run the Fastly build.

### P3

- **F-13** — Two request IDs are minted per request: `src/cloudflare.ts:45` (used only for the 429 and asset paths) and `src/index.ts:241` (used for everything the app handles). The former is discarded on the normal path. Harmless, but a 429 and an app response for the "same" request carry unrelated IDs. Unify by threading the outer ID into the app.
- **F-14** — `NormalizedUrl.hasNonAsciiHostname` (`src/core/normalize_url.ts:48`) is computed on every request but only consumed by the external cushion page, which is unreachable in production (all six issuers set `allowed_dst_external: false`). Dead weight on the hot path.
- **F-15** — `errorStatus` is duplicated verbatim in `src/index.ts:319-325` and `src/core/handle_jump.ts:118-124`, and the two lists can drift. Export one.
- **F-16** — `isStaticAsset` (`src/cloudflare.ts:128-130`) hard-codes `/favicon.ico`. Any future file added to `public/` silently 404s from the Hono app instead of reaching `ASSETS`. Correct today (`public/` holds only `favicon.ico` and `_headers`), but a maintenance trap.
- **F-17** — `src/core/policy.ts:28` re-parses every allowlist entry through `normalizeOrigin` on every request, although `validateRegistry` already validated them at startup. Precompute at construction.
- **F-18** — `vite: 8.0.0-beta.16` is pinned as a devDependency while `vite.config.ts` was deleted; `typescript: 7.0.2` is likewise pinned. Shipping a beta build tool in a security-sensitive service warrants a deliberate decision.

---

## D. Command results

All commands run from the repo root. No dependency install, no formatter/linter auto-fix, no
file written outside this plan document.

| Command                                                               | Exit | Result      | Notes                                                                                                                                                                                                              |
| --------------------------------------------------------------------- | ---- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `git status --short --branch`, `git rev-parse HEAD`, `git reflog -20` | 0    | OK          | HEAD unchanged at `abb80c9`; no Codex commits.                                                                                                                                                                     |
| `git diff` / `git diff --stat` (all paths)                            | 0    | OK          | Read-only.                                                                                                                                                                                                         |
| `pnpm run typecheck` (`tsc --noEmit`)                                 | 0    | **PASS**    | No files emitted.                                                                                                                                                                                                  |
| `pnpm run test` (`vitest run`)                                        | 0    | **PASS**    | 1 file, **121 tests passed**, 605ms.                                                                                                                                                                               |
| `pnpm run lint:check` (`oxlint --type-aware .`)                       | 1    | **FAIL**    | `Failed to find tsgolint executable... add the 'oxlint-tsgolint' package` → **F-2**.                                                                                                                               |
| `pnpm run format:check` (`oxfmt . --check`)                           | 1    | **FAIL**    | Format issues in `knip.json` → **F-5**. No file rewritten (`--check`).                                                                                                                                             |
| `pnpm exec knip --include unlisted,unresolved,binaries`               | 0    | **PASS**    |                                                                                                                                                                                                                    |
| `pnpm exec tsx -e '<inline probe>'` ×3                                | 0    | OK          | In-memory `app.fetch` probes for header parity, HEAD handling, and path normalization. No file written.                                                                                                            |
| Reads of `node_modules/{hono,jose,wrangler}` sources                  | 0    | OK          | hono `compose.js`, `secure-headers.js`; jose `jws_algorithms.js`, `jwk_to_key.js`; wrangler `config-schema.json`.                                                                                                  |
| `pnpm run test:cov`                                                   | —    | **NOT RUN** | Writes a coverage directory.                                                                                                                                                                                       |
| `pnpm run cloudflare:check` (`wrangler deploy --dry-run`)             | —    | **NOT RUN** | Writes `dist/cloudflare`. **This is the highest-value unrun check** — it is the only verification that the new `wrangler.jsonc` (`run_worker_first`, `secrets_store_secrets`, three `ratelimits`) actually builds. |
| `pnpm run test:e2e`                                                   | —    | **NOT RUN** | Starts a server; needs a Playwright browser download.                                                                                                                                                              |
| `pnpm run fastly:build`                                               | —    | **NOT RUN** | Out of scope by instruction.                                                                                                                                                                                       |
| `pnpm audit`, `pnpm outdated`, gitleaks                               | —    | **NOT RUN** | Network-dependent CI jobs.                                                                                                                                                                                         |

**Files created or modified by the audit: none**, other than this plan document.

Two Codex-attributable claims were **disproved by direct verification**, and two hypotheses of
mine were disproved — recorded so neither is taken on trust:

- I predicted `app.onError()` responses would lack security headers, because both `responseHygiene`
  and hono's `secureHeaders` apply headers _after_ `await next()` (`secure-headers.js:85`). **Wrong**:
  hono's `compose()` catches at each `dispatch(i)` level (`node_modules/hono/dist/compose.js:24-31`),
  so the error becomes a response at the innermost frame and outer middleware unwinds normally.
  Probed empirically — 404/405/400/503 all carry CSP, HSTS, `no-store`, XFO, and `X-Request-ID`.
- I predicted `HEAD /about` would 404 (hono `app.get` registering GET only). **Wrong** — returns 200.
- Conversely, a handoff report of "format, lint, typecheck, unit tests all pass" would be **false**:
  lint and format both fail (F-2, F-5).

---

## E. Test gaps

121 tests pass, and coverage of claim/URL/policy validation is genuinely strong. These contracts
are **not** covered by any passing test:

1. **The entire deadline mechanism.** `grep -n "deadline\|abort\|504\|timeout\|useFakeTimers" test/jump.test.ts` returns **zero matches**. Untested: single deadline shared by the first fetch and the forced refresh; `AbortSignal` actually reaching `fetch()`; abort → 504 classification; abort vs. upstream-failure disambiguation; nothing left running after the deadline. This is the most complex new mechanism and it has no test at all.
2. **Cross-request cache reuse through the Cloudflare entrypoint** (F-4). `JWKS cache avoids repeated fetch…` tests `JwksCache` in isolation, never the `default.fetch` → `WeakMap<env>` path. No test issues two requests to the Worker entrypoint.
3. **Rate-limit routing.** No test asserts that `/` uses `JUMP_RATE_LIMITER`, `/.well-known/jwks.json` uses `JWKS_RATE_LIMITER`, and `/about` uses `INFO_RATE_LIMITER`; none asserts `/favicon.ico` bypasses rate limiting entirely; none exercises the limit boundary (120/600/300).
4. **`fetchRegistryJwks` negative paths.** The one test asserts only that the _options object_ contains `redirect: 'error'` — it never feeds back a redirect response. Untested: an actual redirected response, a non-JSON `Content-Type`, `Content-Length` over 64 KiB, a streamed body exceeding the cap, invalid JSON, upstream 5xx → 503 vs. 4xx → 502, and abort → 504.
5. **Output TTL boundary.** No assertion that `exp - iat === 30` (or that 31 is impossible).
6. **JWKS key hygiene** (F-6): duplicate `kid`, private `d` in an issuer JWKS, `use: 'enc'`, missing `kty`.
7. **Request-ID spoofing.** No test sends an inbound `X-Request-ID` and asserts it is not reflected.
8. **Log prohibition as an assertion.** Tests confirm `rt` is absent from the app logger and the audit entry, but nothing asserts the _absence_ of the other banned fields (IP, Referer, User-Agent, Cookie, full URL, `jti`, hashes) — and nothing covers the runtime-emitted invocation log (F-3), which no in-process test can observe.
9. **Runtime fidelity.** Every test runs in Node via plain `vitest`; `@cloudflare/vitest-pool-workers` is not a dependency. `env`-object identity, `ASSETS` binding behavior, the Rate Limiting binding, Secrets Store semantics, and `run_worker_first` routing are therefore all simulated by hand-written fakes, never exercised against workerd. This is the structural reason F-4 is unprovable from the current suite.
10. **CI path/command existence.** No test asserts that the scripts the workflow invokes exist and run — which is precisely how F-2 and F-5 reached this state.

---

## F. Go / No-Go

### **NO-GO**

Blocking:

- **F-2** — `lint:check` cannot execute; the CI `quality` job fails. Type-aware lint has never run against this implementation.
- **F-5** — `format:check` fails on `knip.json`; same job, second independent failure.
- **F-3** — `invocation_logs: true` writes the full `rt` JWT and destination URL into persisted logs at 100% sampling, directly violating the audit-log prohibitions.
- **F-4** — Cross-request cache reuse is unproven and plausibly nonexistent; if so, the 1-second deadline and the 120 rps budget are not achievable.
- **F-1** — Supply-chain controls (`ignore-scripts`, pinned registry) were removed outside the stated scope, alongside a full lockfile re-resolution.

Also unresolved: **F-10** (30-day retention, external/operational) and the fact that
`pnpm run cloudflare:check` — the only proof the new `wrangler.jsonc` builds — has not been run.

No P0 issue was found, and the cryptographic core (algorithm pinning, claim validation, origin
allowlisting, key-material handling) holds up under direct inspection against jose's source.
Issuer/JWKS configuration matches the confirmed canonical set exactly, so no Rails-side
issuer mismatch was detected from this side.

---

## G. Proposed remediation (awaiting explicit approval — nothing applied)

Ordered by blocking status. All changes preserve the user's existing modifications; none
touches Fastly code, and `fastly.toml` is left as-is pending a decision on F-12.

**Gate 0 — make CI runnable (F-2, F-5)**

- Add `oxlint-tsgolint` to `devDependencies` at the version matching `oxlint@1.77.0`; re-run `pnpm run lint:check` and fix what it reports.
- Run `pnpm run format` (rewrites `knip.json` only).
- Run `pnpm run cloudflare:check` to prove `wrangler.jsonc` builds.

**Gate 1 — close the two security/operability blockers (F-3, F-4)**

- `wrangler.jsonc`: `"invocation_logs": false`. Add a test asserting it.
- `src/cloudflare.ts`: replace the `WeakMap<env>` app cache with a module-level singleton; add a two-request entrypoint test asserting one JWKS fetch and one signer import.

**Gate 2 — user decisions (F-1, F-10, F-12)**

- `.npmrc`: confirm whether the hardening removal was intended; restore `ignore-scripts=true` and the registry pin if not.
- `docs/logging.md`: record 30-day retention as an operational precondition.
- Decide whether the `fastly.toml` build-script edit stays.

**Gate 3 — contract completeness (F-6, F-9, F-11, F-7, F-8)**

- Tighten `isJwks` (`kty`/`crv`/`alg`/`kid`/`use`, no private material, no duplicate `kid`).
- Default `replayCache` to `NoopReplayCache`.
- Stop `trimTrailingSlash` from applying to the jump path.
- Log revoked-kid hits; log the missing-`CF-Connecting-IP` fail-open.

**Gate 4 — close the test gaps (E-1 through E-10)**

- Deadline suite using an injected clock and a controllable `fetch` — no real-time `sleep`.
- `fetchRegistryJwks` negative-path suite.
- Rate-limit routing and asset-bypass tests.
- `exp - iat === 30` assertion.
- Evaluate adding `@cloudflare/vitest-pool-workers` so binding behavior is exercised against workerd rather than fakes (this is the only way E-9 and F-4 close properly).

### Verification after any approved change

`pnpm run format:check && pnpm run lint:check && pnpm run typecheck && pnpm run test && pnpm exec knip --include unlisted,unresolved,binaries && pnpm run cloudflare:check`
— all six must pass, then report the final diff and residual risk.

---

## H. Remediation applied

All Gate 0–4 items were applied after approval. Fastly was not touched: `src/fastly.ts` is
byte-identical to baseline, and `fastly.toml` retains only Codex's pre-existing line, which
the user elected to keep (F-12).

### Verification — all six pass

| Check              | Before                 | After                                                             |
| ------------------ | ---------------------- | ----------------------------------------------------------------- |
| `format:check`     | **FAIL** (`knip.json`) | PASS                                                              |
| `lint:check`       | **FAIL** (no tsgolint) | PASS — 30 files, 94 rules, 0 findings                             |
| `typecheck`        | PASS                   | PASS                                                              |
| `test`             | PASS (121)             | PASS (**153**, +32)                                               |
| `knip`             | PASS                   | PASS                                                              |
| `cloudflare:check` | **NOT RUN**            | PASS — Worker builds; all bindings and 120/600/300 limits resolve |
| `test:cov`         | NOT RUN                | PASS — 93.37% stmts / 89.6% branch                                |

### Findings closed

| ID   | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-1  | `.npmrc` restored: `ignore-scripts=true`, `registry=https://npm.flatt.tech/`, `audit=true`, `engine-strict=true`. `manage-package-manager-versions=false` kept (Corepack ban). **Deliberate deviation:** `min-release-age=1` was _not_ restored — it is the kebab-case form of the same pnpm setting as `minimumReleaseAge: 4320` in `pnpm-workspace.yaml`, so restoring it would have cut the release-age gate from 3 days to 1 minute while appearing to restore a control. |
| F-2  | Added `oxlint-tsgolint@7.0.2001` (`oxlint@1.77.0` peer-requires `>=7.0.2001`). Lint runs and passes.                                                                                                                                                                                                                                                                                                                                                                          |
| F-3  | `wrangler.jsonc`: `invocation_logs: false`, `logs.enabled` kept true. Guarded by a config test.                                                                                                                                                                                                                                                                                                                                                                               |
| F-4  | `src/cloudflare.ts`: the app + `JwksCache` moved to a module-scope `Map` keyed on `serviceOrigin` + revision — configuration, not object identity — so they survive regardless of how workerd hands over `env`. Key material stays in a per-`env` `WeakMap` (see residual risk).                                                                                                                                                                                              |
| F-5  | `pnpm run format` applied (`knip.json` + this document).                                                                                                                                                                                                                                                                                                                                                                                                                      |
| F-6  | `parseJwks` now enforces `kty:EC` / `crv:P-384` / `alg:ES384` / `use` absent-or-`sig` / non-empty `kid` / `x`,`y`. Private material and duplicate `kid` reject the **whole** set; merely unusable keys are dropped so an issuer publishing an unrelated key cannot take its own redirects down.                                                                                                                                                                               |
| F-7  | Revoked-kid hits now emit `jump_revoked_kid_rejected` (`iss` + `kid` only).                                                                                                                                                                                                                                                                                                                                                                                                   |
| F-8  | The `CF-Connecting-IP` fail-open now emits `jump_rate_limit_skipped` with route class only — no address.                                                                                                                                                                                                                                                                                                                                                                      |
| F-9  | `createApp` defaults to `NoopReplayCache`; the redirect decision no longer depends on isolate-local state.                                                                                                                                                                                                                                                                                                                                                                    |
| F-10 | `docs/logging.md` gained a "Platform Log Settings" section recording the account-level 30-day retention and the invocation-log rule as rollout preconditions.                                                                                                                                                                                                                                                                                                                 |
| F-11 | `trimSlashExceptRoot` leaves all-slashes paths as a plain 404, so `GET //?rt=<jwt>` no longer answers 301 with the token echoed into `Location`. `/about/` still normalizes.                                                                                                                                                                                                                                                                                                  |

### Tests added (+32)

- **Deadline suite (closes the zero-coverage gap):** 504 classification; the abort reaching the fetch layer (asserts the recorded signal actually fired); a forced refresh sharing the _same signal object_ as the first fetch, proving one deadline rather than a reset; late-completing work unable to replace the 504 and settling without an unhandled rejection; abort distinguished from an upstream fault. Driven by a never-resolving fetch, so they turn on the abort firing, not on wall-clock timing.
- **JWKS transport:** content-type, advertised over-size, streamed over-cap (a `ReadableStream` with no `Content-Length`, so it exercises the cap rather than the header check — asserts it stops after <16 chunks), invalid JSON, 5xx/429 vs 4xx split, `redirect: 'error'`, private material, duplicate `kid`, unusable-key filtering, empty keyset.
- **Route/rate limit/request id:** per-route limiter binding selection, key not divertable via `X-Forwarded-For`/`X-Real-IP`, static assets bypassing every limiter, 429 carrying the full protection set, fail-open notice, `X-Request-ID` spoof rejection and per-request uniqueness, the `//?rt=` regression, `/about/` normalization, replay-default and revoked-kid behavior.
- **Outbound contract:** `exp - iat === 30` exactly, no `src_jti`, exact claim-key set, per-token `jti`.
- **Isolate reuse:** three requests (including one with a fresh `env` object) produce exactly one JWKS fetch and one signer import.

Two test corrections were required, both fixing false confidence rather than weakening a check:
`registry jwks fetcher uses issuer jwks uri` asserted on `{keys:[{kid:'kid-1'}]}` — a keyset with no
`kty` or `crv` that only passed because the old validator accepted anything — and the Cloudflare
handshake fixture needed an explicit cold-isolate reset, because it mints a fresh issuer key under a
reused `iss`/`kid` and a warm isolate now correctly keeps the previous one.

### Residual risk

- **F-4 is mitigated, not proven.** The app and JWKS cache now survive `env` identity changes, and a
  test demonstrates it. Key material is still keyed per-`env`: the cache resolves by `kid` alone, and
  sharing it across differing `env`s would hand a signer built from one secret to a request carrying
  another. If workerd does hand over a fresh `env` per request, the cost is a re-import plus probe
  sign/verify — CPU only, no network. Proving the real behavior still needs
  `@cloudflare/vitest-pool-workers` or `wrangler dev` (E-9).
- **F-10 remains external.** Retention and any dashboard-level observability override are account
  settings; no test can guard them.
- **`pnpm` version drift (F-11 in section B).** The lockfile was regenerated with local pnpm 11.3.0
  while CI pins 10.29.3. `lockfileVersion` stayed `9.0`, so `--frozen-lockfile` should still resolve,
  but this is unverified against 10.29.3 and the repo still pins no local toolchain version.
- **Not run:** `test:e2e` (needs a browser download), `pnpm audit`/`outdated`/gitleaks (network CI
  jobs), and the Fastly build (out of scope).
- P3 items F-13 through F-18 were left alone as out-of-scope cleanups.

### Status: **GO WITH FOLLOW-UPS**

Every P0/P1 blocker is closed and independently verified. The follow-ups are the workerd-fidelity
test suite, the account-level log settings, and confirming the lockfile against pnpm 10.29.3.
