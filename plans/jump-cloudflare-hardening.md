# Jump Cloudflare Hardening Plan

## Status and scope

- Status: approved for implementation on 2026-08-25.
- Repository: `seahal/umaxica-apps-edge-jump`, current branch `develop`.
- Cloudflare Workers and the shared Hono core are in scope.
- Fastly is experimental, unverified, and outside the production scope of this change. Fastly code, configuration, and dependencies must not be changed.
- No commit, push, pull request, or Cloudflare deployment is authorized.
- Existing user changes in `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml` must be preserved.

## Fact, inference, and proposal notation

- **Fact**: established by repository code/tests or a cited primary source.
- **Inference**: consequence derived from facts.
- **Decision**: maintainer-approved contract from the closed interview.
- **Implementation**: the approved local change that realizes a decision.

## Primary sources

### Hono: Cloudflare Workers

- Source: Hono, “Cloudflare Workers”
- URL: https://hono.dev/docs/getting-started/cloudflare-workers
- Confirmed specification: the documented module-worker form constructs a Hono app at module scope and exports `app.fetch` (or delegates to it from a module handler). Bindings are request context values available through `c.env`.
- Current impact: `src/cloudflare.ts` currently constructs the app inside every `fetch()` call, so the router and its `JwksCache` do not survive to the next request.
- Classification: fact and implementation requirement.

### Hono: middleware order and error propagation

- Source: Hono, “Middleware”
- URL: https://hono.dev/docs/guides/middleware
- Confirmed specification: middleware executes as an onion in registration order; pre-`next()` runs in registration order and post-`next()` runs in reverse order. Thrown errors are handled by `app.onError()` or Hono’s default 500 conversion before control returns through outer middleware.
- Current impact: `timeout()` is currently outside `responseHygiene` and `jumpSecureHeaders`, so a timeout can bypass their post-processing. No explicit `app.onError()` contract exists.
- Classification: fact; security/header reordering is an implementation.

### Hono: timeout middleware

- Source: Hono, “Timeout Middleware”, and installed Hono 4.13.3 `dist/middleware/timeout/index.js`
- URL: https://hono.dev/docs/middleware/builtin/timeout
- Confirmed specification: timeout races `next()` against a rejecting timer. The installed implementation does not create or propagate an `AbortSignal` and does not cancel the losing operation.
- Current impact: the existing `timeout(1000)` can return 504 while JWKS fetch, refresh, import, or signing work continues.
- Classification: fact. A request-owned deadline signal is required in addition to a response timeout.

### Hono built-in middleware

- Sources: Hono secure headers, logger, request ID, trailing slash, and error handling documentation/source.
- URLs:
  - https://hono.dev/docs/middleware/builtin/secure-headers
  - https://hono.dev/docs/middleware/builtin/logger
  - https://hono.dev/docs/middleware/builtin/request-id
  - https://hono.dev/docs/middleware/builtin/trailing-slash
  - https://hono.dev/docs/api/hono#error-handling
- Confirmed specification: `secureHeaders()` applies configured response headers; `logger()` logs before and after `next()`; `requestId()` accepts an incoming request ID by default; `trimTrailingSlash()` may convert a 404 to a 301; `app.onError()` supplies the application error response.
- Current impact: incoming request IDs must not be trusted; trailing slash, errors, timeout, and audit logging need explicit contracts.
- Classification: fact and decision 24.

### Cloudflare: isolates, module scope, and bindings

- Sources: Cloudflare Workers, “How Workers works”, “Fetch Handler”, and “Limits”.
- URLs:
  - https://developers.cloudflare.com/workers/reference/how-workers-works/
  - https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/
  - https://developers.cloudflare.com/workers/platform/limits/
- Confirmed specification: an isolate may serve multiple sequential and concurrent requests; module state can be reused but is not durable and an isolate may be evicted. The same `env` object may be passed to multiple requests while the environment is unchanged. An isolate has a shared memory limit.
- Current impact: immutable/module-local dependency caches are suitable performance optimizations, but correctness cannot depend on cache persistence or request routing to a particular isolate.
- Classification: fact, decisions 3 and 19.

### Cloudflare: Cache API and KV decision

- Sources: Cloudflare Workers Cache API and “How the Cache works”.
- URLs:
  - https://developers.cloudflare.com/workers/runtime-apis/cache/
  - https://developers.cloudflare.com/workers/reference/how-the-cache-works/
- Confirmed specification: Cache API entries are ephemeral and data-center-local, not globally replicated; KV is a separate persistent distributed service.
- Current impact: neither Cache API nor KV can be part of redirect authorization, replay, or correctness. This change uses isolate-local caches only.
- Classification: fact and decision 3.

### Cloudflare: Secrets Store

- Source: Cloudflare Secrets Store, “Workers integration”.
- URL: https://developers.cloudflare.com/secrets-store/integrations/workers/
- Confirmed specification: a Secrets Store binding is accessed asynchronously with `binding.get()`; production secrets are not available automatically in local development.
- Current impact: private-key loading must remain asynchronous, fail closed, and be cached only for a bounded lifetime keyed to deployment/configuration identity so rotation is eventually observed.
- Classification: fact; bounded signer cache is an implementation.

### Cloudflare: Rate Limiting binding

- Source: Cloudflare Workers, “Rate Limiting”.
- URL: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Confirmed specification: simple periods are 10 or 60 seconds; counters are per Cloudflare location, permissive/eventually consistent, and unsuitable for exact accounting. Cloudflare warns that shared IPs can group unrelated users.
- Current impact: the binding is abuse mitigation only. Separate 60-second bindings and route classes are required by decisions 22–23.
- Classification: fact and decisions 22–23. The accepted IP trade-off is explicit.

### Cloudflare: waitUntil and AbortController

- Sources: Cloudflare Fetch Handler / ExecutionContext and Workers AbortController runtime API.
- URLs:
  - https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/
  - https://developers.cloudflare.com/workers/runtime-apis/abortcontroller/
- Confirmed specification: `waitUntil()` extends work after a response; AbortController supplies a signal to abort supporting operations such as fetch.
- Current impact: security-critical work must finish or abort before the response; it must not be moved to `waitUntil()`.
- Classification: fact and decision 19.

### Cloudflare: version metadata

- Sources: Cloudflare Workers “Versions and deployments” and version metadata binding documentation.
- URLs:
  - https://developers.cloudflare.com/workers/versions-and-deployments/
  - https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/
- Confirmed specification: a version captures code, static assets, bindings, and compatibility settings; version metadata exposes deployment identity.
- Current impact: deployment version is part of the signer-cache key and audit context, but is not an authorization input.
- Classification: fact and implementation.

### Cloudflare: static assets routing

- Source: Cloudflare Workers Static Assets, “Worker script”.
- URL: https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
- Confirmed specification: `assets.run_worker_first` controls whether Worker code runs before asset serving; an assets binding is used to fetch assets when Worker-first routing is enabled.
- Current impact: the present default asset-first behavior bypasses Hono middleware for `favicon.ico`. Decision 26 requires Worker-first and a tested header contract without changing Fastly.
- Classification: fact and decision 26.

### Fetch Standard: redirects and abort

- Sources: WHATWG Fetch Standard and DOM Standard.
- URLs:
  - https://fetch.spec.whatwg.org/
  - https://dom.spec.whatwg.org/#aborting-ongoing-activities
- Confirmed specification: redirect mode defaults to `follow`; `redirect: "error"` converts an HTTP redirect into a network error. AbortController signals observers and fetch observes an attached signal.
- Current impact: registry JWKS fetch currently follows redirects. It must use `redirect: "error"` and the shared request deadline.
- Classification: fact and decision 20.

### JWT/JWS standards

- Sources: RFC 7519, RFC 8725, RFC 7515.
- URLs:
  - https://www.rfc-editor.org/rfc/rfc7519.html
  - https://www.rfc-editor.org/rfc/rfc8725.html
  - https://www.rfc-editor.org/rfc/rfc7515.html
- Confirmed specification: `exp`, `nbf`, and `iat` use NumericDate; small clock leeway may be allowed; `jti` identifies the JWT but does not itself enforce single use. Applications must verify allowed algorithms and not blindly follow token-provided `jku` or `x5u`; `kid` is a key-selection hint and must not become an injection input.
- Current impact: ES384 stays pinned; `none`, `jku`, `jwk`, `x5u`, and `crit` stay rejected; finite NumericDate checks, exact TTL limits, and the five-second skew contract are required.
- Classification: fact and decisions 1–7.

### Source discrepancies

- Hono timeout documentation says the promise is rejected after the duration; its source confirms this does not abort downstream work. There is no contradiction, but the documentation alone can be misread as cancellation.
- Cloudflare recommends stable user identifiers rather than IPs for rate limiting; decision 23 explicitly selects provider-confirmed client IP because Jump has no authenticated user identifier. This is an accepted trade-off, not a claim that IP is an identity or exact quota.
- The repository’s accepted ADR 0001 says not to use Workers Static Assets, while `wrangler.jsonc` and `public/` now do. Decision 26 supersedes the operational part of that ADR for Cloudflare only; the ADR must be amended rather than silently ignored.

## Reproduced current behavior

- `src/cloudflare.ts` calls `createApp()` once per fetch invocation. Therefore Hono router, positive/negative JWKS cache, single-flight map, and forced-refresh cooldown do not survive to a subsequent Cloudflare request.
- Within one `JwksCache`, a known `iss`/`kid` token with an invalid signature performs at most the initial JWKS acquisition plus one forced refresh; repeated calls share the cooldown. Existing tests validate only this object-local behavior.
- Concurrent calls on one `JwksCache` use the issuer-keyed in-flight promise. Cloudflare requests do not currently share that object.
- Every `/.well-known/jwks.json` request currently reads the PEM and kid, imports PKCS#8, derives a public JWK, and performs a probe sign/verify.
- An internal Jump request currently derives the public JWKS and then imports/checks the private key again for the signer; actual outbound signing is an additional signature.
- `fetchRegistryJwks()` uses its own 800 ms AbortController. Forced refresh receives a new 800 ms timer rather than the original request’s remaining deadline.
- Fetch redirect mode is unspecified and therefore follows redirects.
- JWKS fetch, HTTP errors, invalid content, JSON errors, cache errors, and signature mismatch collapse to `invalid_signature` after retry.
- Middleware order is currently: logger → language → requestId → timeout → trailing-slash → responseHygiene → secureHeaders → route. Post-response processing unwinds in reverse; timeout can bypass the inner header middleware.
- Cloudflare rate limiting runs before Hono and uses one `10,000 / 10 seconds` binding for all paths.
- Cloudflare uses `NoopReplayCache`; repeated input tokens produce fresh output `jti` values. Decisions 1–4 accept this and do not add `src_jti`.
- The production registry contains deprecated `id.*` and `www.jp.*` issuers and does not contain the approved `auth.*`/`jp.*` matrix.
- CI contains a copied eight-directory Vite matrix that does not exist in this repository.
- Existing local tests passed before implementation: 116/116. The repository was subsequently migrated from Vite+ to pnpm-managed standard tools.

## Approved decisions

1. Jump tokens communicate redirect decisions only. They must not establish identity, sessions, authorization, CSRF approval, or side effects.
2. Input tokens may be reused until expiry. Receiving applications must independently authenticate and authorize; no single-use contract is added.
3. Correctness must not depend on persistent/shared state. Bounded isolate-local caches are permitted optimizations.
4. Do not add `src_jti`; retain schema 1.
5. Inbound normal and maximum TTL are exactly 300 seconds. Require finite NumericDates, `exp > iat`, and `exp - iat <= 300`.
6. Outbound TTL remains exactly 30 seconds.
7. Maximum clock skew is five seconds and applies once to comparison with current time, never to structural TTL.
8. Production arbitrary external destinations are forbidden.
9. `allowed_dst_external` is `false | readonly string[]`; `true`, wildcard, suffix, and regex rules are impossible/fail closed.
10. Only Auth and Base are production issuers.
11. Canonical issuers are the six exact `https://auth.umaxica.{app,com,org}` and `https://www.umaxica.{app,com,org}` origins.
12. Each issuer’s JWKS URI is the same-origin `/.well-known/jwks.json`, fetched without redirects or dynamic discovery.
13. Internal destinations are exactly: Auth → same-TLD Base; Base → same-TLD Auth and `https://jp.umaxica.<tld>`.
14. Cross-TLD transitions are forbidden.
15. No other issuer is registered.
16. Production and non-production registries are isolated; request input cannot select an environment.
17. Old `id.*` and `www.jp.*` entries are removed at an explicit T0 with no 30-day compatibility window.
18. Issuer key owners request revocation; Jump administrators review and urgently deploy the denylist. Incident metadata is retained outside this repository.
19. The total request deadline remains one second and is propagated as one AbortSignal; retries do not reset it.
20. Status contract: 400 invalid/expired token; 405 unsupported method with `Allow: GET, HEAD`; 429 abuse limit; 502 invalid upstream response/redirect/contract; 503 temporary upstream or signer/binding outage; 504 total deadline; 500 unclassified defect. Public bodies do not disclose verification detail.
21. Jump execution accepts GET/HEAD and exactly one non-empty `rt`; unknown or duplicate query parameters are 400. HEAD matches GET status/Location/headers with an empty body.
22. Rate limiting has separate Jump, public-JWKS, and informational bindings; assets have no Worker rate limiter.
23. Per provider-confirmed source IP per 60 seconds: Jump 120, JWKS 600, informational 300.
24. Generate an internal UUID request ID for every Worker request; ignore incoming request-ID headers; record Cloudflare Ray separately.
25. Raw audit logs retain only the approved fields for 30 days; no JWT/token fragment, URL/path/query/fragment, jti/hash, IP/hash, Referer, User-Agent, Cookie, or secret material.
26. Cloudflare assets run Worker-first and receive the same security/header contract. Fastly remains unchanged.
27. Rollout follows dependency order and removes old issuers at an explicit T0; rollback never re-enables a revoked key.

## Planned files

- `plans/jump-cloudflare-hardening.md`: evidence, decisions, implementation, rollout, and verification record.
- `src/cloudflare.ts`: module-scope application/dependencies, signer/key cache, route rate limiting, request/audit context, static asset dispatch.
- `src/index.ts`: deadline, request ID, middleware/error/method/query/header contract, per-request dependency resolution.
- `src/core/fetch_jwks.ts`: shared AbortSignal, redirect denial, URL contract, typed upstream failures.
- `src/core/jwks_cache.ts`: request-spanning cache, cache observations, expiry/rotation tests, bounded retry behavior.
- `src/core/verify_jwt.ts`, `src/core/types.ts`, `src/core/handle_jump.ts`: finite NumericDate, TTL/skew, error taxonomy, schema-1 and audit contract.
- `src/config/registry.umaxica.ts`: approved six issuers and exact destination matrix.
- `wrangler.jsonc`, generated Worker binding types if used, `public/_headers`: separate bindings and Worker-first asset binding/header behavior.
- `.github/workflows/integration.yaml`, `package.json`, and pnpm configuration: Jump-only CI using pnpm-managed standard tools.
- `test/jump.test.ts`, `e2e/smoke.spec.ts`, test configuration: mandatory cache/deadline/JWKS/header/registry/CI contracts.
- `README.md`, `docs/*.md`, `docs/operations/*.md`, `adr/*.md`: contract, Fastly status, migration, key rotation, log retention, and superseded ADR statements.

## Schema and migration

- JWT schema remains 1. No `src_jti` or other claim is added.
- Inbound structural TTL changes from 30 days to 300 seconds; skew changes from 60 to five seconds.
- Outbound TTL stays 30 seconds.
- Registry migration is additive before T0, then subtractive at T0. Because the final repository cannot encode two different final moments, the implementation will provide the final canonical registry and document the temporary rollout release as a deployment prerequisite/version.
- T0 (ISO 8601): **UNSET — maintainer must fill this before rollout; do not infer a date.**

## External repository prerequisites

- Rails receivers must accept schema 1 output tokens with exact 30-second TTL and at most five-second skew, without deriving authentication/authorization or state change from the token.
- Rails Auth/Base issuers must emit the six canonical `iss` values, expose same-origin Jump-specific ES384 JWKS, and issue exact/maximum 300-second input tokens.
- Base destinations must support the approved `auth.*` and `jp.*` same-TLD routes. Core is not an issuer.
- Each production JWKS URL, current active kid, rotation overlap, and revoked-kid owner must be verified live before rollout. This repository cannot prove those systems.
- Cloudflare must provide three distinct rate-limit bindings, an Assets binding, Workers Logs retention/access controls, and edge/WAF protection for static assets.
- T0 must be supplied explicitly and coordinated with issuer cutover. The code must not guess it.

## Deployment sequence

1. Update Rails receivers for schema 1, outbound TTL 30 seconds, and maximum skew five seconds.
2. Deploy a temporary additive Jump registry accepting canonical and old issuers. This is an operational intermediate release, not the final registry committed by this plan.
3. Switch Rails issuers to canonical `iss`, same-origin JWKS, and 300-second TTL; stop old issuance.
4. Run end-to-end smoke, JWKS rotation/failure classification, audit-log, metric, and header checks.
5. At explicit T0, deploy the final Jump release enforcing 300-second TTL/five-second skew and removing old entries.
6. Reissue old redirect URLs through a new flow; do not retain 30-day token compatibility.

## Rollback

- Receiver rollout, issuer rollout, registry rollout, and Jump runtime release are independently reversible.
- Before T0, revert an issuer to its previous configuration only while the additive Jump registry still accepts it.
- After T0, rollback to the additive registry only if the old issuer keys remain trusted and are not revoked.
- Never remove a compromise denylist or reactivate a revoked key as part of rollback.
- Isolate-local caches disappear on deployment/eviction; no persistent cache migration or cleanup is required.
- Static asset Worker-first can be reverted independently only if the asset security-header contract remains enforced by another verified Cloudflare layer.

## Test matrix

- Cache: sequential requests, concurrent single-flight, negative cache across requests, forced-refresh cooldown across requests, invalid-signature fetch bound, expiry, and new-kid rotation.
- Signer: binding reads, PKCS#8 imports, public derivations, probe operations, actual signs, public-JWKS requests, cache expiry, and rotation.
- Deadline: fetch abort, shared retry budget, no post-timeout continuation, one audit record, and full 504 headers.
- JWKS: redirect rejection, HTTP/userinfo/port rejection, body/type/JSON/schema validation, upstream 429/5xx/network mapping, and signature-vs-upstream distinction.
- JWT: finite NumericDates, `exp > iat`, 300/301-second input boundary, exact 30-second output, and five-second skew boundary without double leeway.
- HTTP: 200/302/400/404/405/429/502/503/504/500 headers, no Set-Cookie, GET/HEAD parity, duplicate/empty/unknown query, trailing slash, HTML escaping, and CSP hash.
- Registry: six exact issuers/JWKS URIs, approved destination matrix, no wildcard/HTTP/port/obsolete/nonproduction/external-true entry.
- Rate limits: route class and 120/600/300 boundary; no rate binding for assets.
- Logging: internal request ID correlation and approved fields only; forbidden request/token/client fields absent.
- CI: no nonexistent directories; format, lint, typecheck, knip, unit, coverage, Playwright, audit, gitleaks, Wrangler dry-run, and bundle-size report; Fastly is not required.

## Unresolved risks

- Live Rails issuer/JWKS/destination behavior and receiver clock handling are unverified in this repository.
- Rate-limit bindings are approximate and location-local; WAF/edge policy remains an external layer.
- Isolate-local caches reduce but cannot eliminate cold-start JWKS load.
- A one-second total deadline may be tight during a cold isolate that must fetch JWKS and import keys; tests and production metrics must validate it.
- Workers Logs 30-day deletion and least-privilege access are Cloudflare account controls and cannot be proven by source alone.
- The final registry intentionally removes old issuers; deploying it before the additive migration and T0 would cause an outage.

## Implementation and verification record

- Implemented the final six-issuer registry, exact destination matrix, external-origin type, 300-second input TTL, 30-second output TTL, five-second skew, typed upstream failures, no-redirect JWKS fetch, shared request deadline, isolate-local dependency/key caches, three rate-limit bindings, internal request IDs, Worker-first assets, and Jump-only CI.
- Unit tests initially passed before the pnpm-only toolchain migration; the final pnpm result is recorded below.
- Format, lint, typecheck, and knip: passed. Knip reports only non-failing redundant-entry hints.
- Cloudflare dry-run: passed with Wrangler 4.125.0. Upload was 274.67 KiB (64.96 KiB gzip); generated `cloudflare.js` was approximately 85 KiB. Wrangler could not write its optional debug log under the read-only user configuration directory, but exited successfully.
- Coverage provider and Vitest are pinned to the same version in the pnpm-only toolchain; final coverage results are recorded after migration verification.
- Playwright E2E was blocked in this sandbox because tsx could not create/listen on `/tmp/tsx-1000/230.pipe` (`EPERM`). Rerun `pnpm run test:e2e` in the CI runner or an environment that permits the IPC socket.
- Dependency audit was blocked by DNS/network failure (`EAI_AGAIN npm.flatt.tech`). Rerun `pnpm audit --audit-level=high` with registry access.
- Gitleaks was not available as a local repository binary; the required CI action remains configured and is unverified until CI runs.
- No deployment, commit, push, or pull request was performed.
