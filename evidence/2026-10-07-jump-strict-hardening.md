# Jump strict stateless hardening (staging profile)

Date: 2026-10-07 (JST). Status: **IMPLEMENTED LOCALLY, NOT DEPLOYED**. Work done
in a Claude Code cloud container. Everything below was run there unless marked
otherwise. No Cloudflare, Rails, Global or Edge system was contacted or changed.

## A. Baseline

- Repository commit before: `d84ce1a38c84a48082e07e22db2c58df1efcfa2c`
  (`develop`, "[CAUTION !] ... DO NOT DEPLOY"). Working tree clean before.
- After: committed on branch `claude/jump-strict-hardening`, pushed for the
  owner to pull and verify. `develop` was not modified.
- Staging deployment: **none**. The container had no Cloudflare credentials and
  the owner chose local implementation only. No Worker version identifier exists.
- Production untouched: no deploy, secret, route or key operation. Repository
  config change only (below).
- Config before: `wrangler.jsonc` defined production only; there was no staging
  environment. After: production gains `UMAXICA_JUMP_ENVIRONMENT=production`;
  new `env.staging` with `UMAXICA_JUMP_ENVIRONMENT=staging`, `routes: []`,
  limiter namespace `520901` (proposed; production is `520900`), the same
  observability (`redact_query_string: true`). Staging origin, route and
  signing key are intentionally absent (503 until supplied). A first dry run
  showed `env.staging` would inherit the production custom domain
  `jump.umaxica.net`; `routes: []` was added and is pinned by a test.

Environment notes: Node 22.22.0 (pinned 24.20.0 was not installed). pnpm 12.0.0
from the container's tool cache, whose native binary placeholder had not been
installed; it was run through its Node entry `bin/pnpm.mjs`. `npm.flatt.tech`
(the repository registry) was refused by the network policy, so
`pnpm install --frozen-lockfile --registry=https://registry.npmjs.org/` was used
for this session only, with lockfile integrity hashes enforced. `pnpm audit` was
not run.

## Phase 0 findings (before changes)

| #   | Finding                                                                                              | Severity | Fix                                                    |
| --- | ---------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------ |
| 1   | No DO/KV/D1/R2/Queue/Cache API/DB binding or code                                                    | —        | none needed                                            |
| 3/7 | `kidNegative` Map keyed by attacker `kid` (bounded 1024 + eviction, but grows with input variety)    | Medium   | removed; per-issuer cooldown state only                |
| 5   | No `jku`/`jwk`/`x5u` fetch; JWKS URL from registry only. `x5c`, `cty`, `b64`, unknown members passed | Low      | closed header member set                               |
| 6   | Nonconforming JWKs silently dropped from a set; `use` absent accepted                                | Low      | whole-set rejection; `use: sig` required               |
| 8   | 64 KiB cap streamed (not after full read); bodyless path used `text()`                               | Low      | bodyless 200 = unusable document                       |
| 9   | No token, JWKS body or redirect URL in logs                                                          | —        | none needed                                            |
| 10  | Production and staging: no staging profile existed                                                   | —        | `UMAXICA_JUMP_ENVIRONMENT` selects only the `typ` pair |
| —   | `HEAD /?rt=` performed full verification and signing                                                 | Low      | 405                                                    |
| —   | Unknown/partial Fetch Metadata and unknown `Sec-Purpose` were ignored                                | Medium   | fail closed                                            |
| —   | Entry query read through `URLSearchParams` (`%72t=` accepted as `rt`)                                | Low      | raw `?rt=<JWS>` only                                   |
| —   | Unknown claims accepted; fractional NumericDates accepted                                            | Low      | closed claim set; integers                             |
| —   | 2 pre-existing failures: `dst: external` cushion (ADR 0007)                                          | —        | runtime rejection                                      |

## B. Statelessness audit

Bindings by kind: static assets (`ASSETS`), Workers Rate Limiting
(`JUMP_RATE_LIMITER`), version metadata, plain vars (`UMAXICA_JUMP_ENVIRONMENT`,
`UMAXICA_JUMP_ORIGIN`, `UMAXICA_JUMP_PRIVATE_KEY_KID`, `UMAXICA_JUMP_PUBLIC_JWKS`),
one Worker secret (`UMAXICA_JUMP_PRIVATE_KEY_PEM`).

DO: none. KV: none. D1: none. R2: none. Cache API protocol state: none. External
database: none. Replay store: none. Queue: none. Checked by
`grep -rniE "durable|kv_namespace|d1_|r2_|caches\.|queue" src wrangler.jsonc`
(only `languageDetector({ caches: false })` matched).

The Rate Limiting binding keeps platform-side counters. It is abuse control
only (fail-open on provider exception, no security decision depends on it), but
the plan forbids durable rate-limit state; recorded as a deviation (J).

Module-scope mutable state:

| State                         | Key                            | Max cardinality             | Lifetime                                              | Correctness depends |
| ----------------------------- | ------------------------------ | --------------------------- | ----------------------------------------------------- | ------------------- |
| `cachedApp` (cloudflare.ts)   | origin + environment + version | 1                           | replaced on change                                    | no                  |
| `JwksCache.issuers`           | registry issuer                | 13                          | keyset 30 s; outage 30 s; bad doc 10 s; cooldown 10 s | no                  |
| per-issuer `inFlight`         | registry issuer                | 1 per issuer                | one fetch                                             | no                  |
| `keyMaterialCaches` (WeakMap) | `env` object                   | env objects alive           | GC                                                    | no                  |
| `CloudflareKeyMaterialCache`  | revision + configured `kid`    | configured kids × revisions | 300 s, swept                                          | no                  |
| `adapterContexts` (WeakMap)   | `Request`                      | in-flight requests          | GC                                                    | no                  |

No structure is keyed by a token value. Pinned by
`test/core-edges.test.ts` "jwks cache bounded state": 5 000 distinct unknown kids
→ 2 fetches, `stateSize` 1; 200 concurrent unknown kids on a cold cache → 2
fetches.

## C. Exact protocol contract

Inbound (issuer → Jump):

| Part   | Name        | Required | Accepted                                                                             |
| ------ | ----------- | -------- | ------------------------------------------------------------------------------------ |
| token  | —           | yes      | compact JWS, 3 Base64URL segments, ≤4096 chars, signature exactly 128                |
| header | alg         | yes      | `ES384` (fixed, never read from the token)                                           |
| header | kid         | yes      | string 1–128, no C0/DEL/C1, exact match                                              |
| header | typ         | yes      | production `JWT`; staging `jump-request+jwt`; exact                                  |
| header | other       | —        | refused (`crit`, `jku`, `jwk`, `x5u`, `x5c`, `x5t`, `cty`, `b64`, `zip`, …)          |
| claim  | schema      | yes      | number `1`                                                                           |
| claim  | rpl         | yes      | `reuse`                                                                              |
| claim  | iss         | yes      | registered issuer origin (string)                                                    |
| claim  | aud         | yes      | string equal to Jump origin (arrays refused)                                         |
| claim  | sub         | yes      | `jump-redirect`                                                                      |
| claim  | iat/nbf/exp | yes      | safe integers, 1 … 4102444800; `exp > iat`, `nbf ≤ exp`, `exp − iat ≤ 30`; now ± 5 s |
| claim  | jti         | yes      | 1–128 printable ASCII (validated, never stored)                                      |
| claim  | dst         | yes      | `internal`                                                                           |
| claim  | url         | yes      | string 1–2048, no control characters, then WHATWG + policy                           |
| claim  | other       | —        | refused                                                                              |

Outbound (Jump → receiver): header exactly `alg: ES384`, `kid` (configured),
`typ` `JWT` (production) / `jump-return+jwt` (staging). Claims exactly
`schema: 1`, `rpl: reuse`, `iss` Jump origin, `aud` target origin,
`sub: jump-redirect`, `iat = nbf = now`, `exp = now + 30`, `jti` =
`crypto.randomUUID()`, `src` issuer, `dst: internal`, `url` canonical target.
Token ≤8192 chars or refused. Private key `importPKCS8(..., { extractable: false })`.

Measured sizes (local script, jose 6.2.12): typical token (37-char kid, UUID
jti, 98-char URL) 687 chars; largest allowed by the bounds (kid 128, jti 128,
url 2048) 3537 chars. Limit 4096. No real Rails token was available to measure.

## D. Navigation results

Unit matrix (`test/fetch-metadata.test.ts`, 6 accepted / 54 rejected partitions,
all expected = actual). Browser (`e2e/navigation.spec.ts`, Chromium 1194
headless, real loopback listener, real Fetch Metadata):

| Request                            | Expected | Actual | Observed metadata                               |
| ---------------------------------- | -------- | ------ | ----------------------------------------------- |
| link click, cross-site             | 302      | 302    | navigate/document/cross-site                    |
| GET form submission                | 302      | 302    | navigate/document                               |
| 303 → 302 chain ending at Jump     | 302      | 302    | navigate/document                               |
| typed navigation                   | 302      | 302    | navigate/document/none                          |
| `fetch` no-cors, `fetch` cors, XHR | 400      | 400 ×3 | no-cors/empty, cors/empty, cors/empty           |
| iframe                             | 400      | 400    | navigate/iframe                                 |
| `<link rel=prefetch>`              | 400      | 400    | no-cors/empty, `Sec-Purpose: prefetch`          |
| speculation-rules prerender        | 400      | —      | **not issued** by headless Chromium; unverified |
| partial metadata / Node fetch      | 400      | 400    | unit + workerd                                  |
| no Fetch Metadata                  | 302      | 302    | compatibility rule kept                         |

Final no-metadata behavior: accepted as before (not a security proof). Firefox
and WebKit were not available in the container: **not run**.

## E. JWKS results

| Item                    | Value                                                                            |
| ----------------------- | -------------------------------------------------------------------------------- |
| accepted Content-Type   | `application/jwk-set+json`, `application/json`; only param `charset=utf-8`       |
| body byte limit         | 65 536 decoded bytes, streamed; Content-Length > limit refused early             |
| key count limit         | 1–4                                                                              |
| timeout                 | request deadline 1000 ms (shared)                                                |
| max cache age           | 30 s; never used past 30 s                                                       |
| forced refresh cooldown | 10 s per issuer                                                                  |
| stale policy            | none; outage → 503 for refresh-dependent requests, warm key ≤30 s still verifies |
| redirect policy         | `redirect: manual`; any non-200 refused                                          |
| cache policy            | `cache: no-store` on the subrequest                                              |
| `use` policy            | `sig` required                                                                   |
| `kid` rule              | string 1–128, no C0/DEL/C1, unique, case-sensitive, not normalized               |
| unknown-kid state       | none per kid; per-issuer `nextForcedRefreshAt` + one `inFlight`                  |
| max state cardinality   | 13 issuer entries                                                                |

Tests: `test/strict-hardening.test.ts` (status 201/203/204/301/302/304/307/400/
404 → unusable, 429/500/503 → temporary; 5 accepted and 11 rejected media types;
64 KiB exact/over; false Content-Length; chunked; 1 MiB gzip body cut at decoded
64 KiB; slow body cut by deadline; connection failure; 28 JWK-set rejections).

## F. Rotation evidence (mock issuer only)

`test/strict-hardening.test.ts` "prepublish-first key rotation", fake timers:
old kid `old`, new kid `new` (test keys). Sequence: old signing (fetch 1) →
new prepublished → +30 s refresh (fetch 2) → signer switches to `new`, verified
without forced refresh (still 2 fetches) → old still verifies → old removed,
+30 s → old refused `invalid_signature` → outage past TTL → `jwks_unavailable`
→ recovery → invalid 200 (`use: enc`) past TTL → `jwks_bad_gateway`. A kid used
before it is cached costs exactly one forced refresh. Intermediary cache
behavior against the real issuer: **not measured** (no network access to
issuers); Jump cannot guarantee freshness through an issuer CDN → Rails item 4.

## G. URL compatibility

The 43-case Rails/WHATWG handoff set is not in this repository and was not
re-run. Added: 19 raw entry-query mutations (duplicate `rt`, `rt[]`, `rt[x]`,
`%72t`, `r%74`, `RT`, empty, `%20`, `+`, `%2B`, encoded dot, `;`, malformed
`%`, leading/trailing params, `&`, bare key, `/`, `%5C`), all 400 before any
JWKS fetch. Existing destination URL suites (userinfo, ports, IPv4/IPv6,
IDNA, control chars, fragments, dot segments, backslash) unchanged and passing.
New WHATWG differential: none found (the entry no longer uses a parser).

## H. Test results

| Command                                             | Result                                             |
| --------------------------------------------------- | -------------------------------------------------- |
| `pnpm run format:check`                             | pass                                               |
| `pnpm run lint:check`                               | 0 warnings, 0 errors                               |
| `pnpm run typecheck`                                | pass                                               |
| `pnpm run test`                                     | 17 files, 1190 passed                              |
| `pnpm exec vitest run --coverage`                   | 100% statements/branches/functions/lines           |
| `pnpm run test:worker` (workerd)                    | pass, incl. staging typ case                       |
| `pnpm exec playwright test` (override config below) | 25 passed                                          |
| `pnpm run test:e2e` as configured                   | 8 failed: Chromium build 1243 missing in container |
| `knip`                                              | no unused files/exports                            |
| `pnpm run cloudflare:check`                         | pass, 284.58 KiB                                   |
| `wrangler deploy --env staging --dry-run`           | pass, no inherited route                           |

E2E ran with a scratch config setting `launchOptions.executablePath` to the
preinstalled `/opt/pw-browsers/chromium`; the repository config is unchanged.
The previously failing `test/internal-only.test.ts` C and D now pass.

## I. Rails handoff

See `docs/rails-handoff.md`: (1) top-level GET navigation for Inertia/Turbo,
no prefetch; (2) `jump-request+jwt` / `jump-return+jwt`; (3) closed header and
claims, integer dates; (4) JWKS media type, `use: sig`, ≤4 keys, prepublish
lead time and the `max-age=3600` intermediary cache; (5) receiver speculative
load defense; (6) clock skew: not observed (no staging run); (7) return-token
schema; (8) receiver-side Rack differential still open.

## J. Deviations

| What                                      | Why                                                  | Security impact             | Compatibility impact                  |
| ----------------------------------------- | ---------------------------------------------------- | --------------------------- | ------------------------------------- |
| No staging deploy or measurement          | no credentials; owner chose local only               | none (not deployed)         | F/D live items open                   |
| Pushed a branch                           | owner instruction in this session                    | none                        | none                                  |
| ADR 0007 runtime rejection of `external`  | pre-existing failing tests; smallest contract        | narrower                    | external RTs refused                  |
| Strictness applies to production code too | one code path; only `typ` differs per environment    | narrower                    | prod redeploy needs Rails items 1,3,4 |
| `HEAD /?rt=` → 405                        | not a navigation; avoided signing on HEAD            | narrower                    | monitors using HEAD                   |
| Token limit 4096 (was 8192)               | derived from claim bounds                            | narrower                    | URLs > 2048 refused                   |
| Rate Limiting binding kept                | removal is an operational decision outside scope     | none (not a security input) | none                                  |
| Staging limiter namespace `520901`        | must differ from production; value is a proposal     | none                        | confirm before deploy                 |
| Cushion renderer kept dormant             | ADR 0007 phase 3 is a separate removal               | none (unreachable)          | none                                  |
| Firefox/WebKit, prerender not verified    | browsers unavailable / prerender not issued headless | unknown for those paths     | —                                     |
