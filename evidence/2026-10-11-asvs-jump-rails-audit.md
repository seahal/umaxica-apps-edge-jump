# ASVS 5.0.0 Jump and Rails boundary audit

Date: 2026-10-11 (Asia/Tokyo).
Scope: current local Jump implementation and the neighboring Rails issuer/receiver code; no production traffic or deployment.
Result: one reproduced Jump policy bypass and one Rails availability finding from source review. No demonstrated external open redirect or signature bypass. This is a scoped assessment, not an ASVS certification or a declaration that the system is vulnerability-free.

## Assessed sources and execution boundary

- Jump HEAD: `0e0b3c62057ecfdf373dc463853efa7fe7255ba6`, with existing uncommitted 0.4.0 candidate changes, including `src/core/redirect_policy.ts`.
- Rails: `../umaxica-apps-global`, HEAD `2a1644f73238839ed7ed513bd4681ea393a86682`. The four inspected receiver/codec/value/concern files had no local modifications. Rails was inspected read-only.
- Current source snapshot: `/tmp/jump-asvs-_kgtjwe8`; 170 existing tracked/untracked, non-ignored files copied, excluding environment-secret files. Manifest SHA-256: `6a8d2d9914eece6a4ce74c5c7bd42cfd53bd8294b9d99ddf58aa836c35993ee7`.
- The checkout had no usable installed executables. Global pnpm 12.4.2 was rejected by project policy. The cached pnpm 12.0.0 binary was then used. Its attempted dependency acquisition in the checkout failed on registry DNS.
- The isolated snapshot reused `/tmp/jump-review-acceptance/node_modules`; its lockfile was byte-identical to this checkout. Lockfile SHA-256: `aa84f953407eb633a8efc7c03059c0e500f1ba5c4e729943b84919f94fe82ccc`.
- `pnpm list --depth 0` verified the installed top-level versions, including Hono 4.13.13, jose 6.2.12, Vitest 5.0.3, TypeScript 7.0.2, Wrangler 4.148.0 and workers-types 5.20261007.1. This does not establish a clean installation or a completed advisory audit.
- Application code, existing tests, dependency declarations, and Rails files were not modified by this audit. Only this evidence record was added to the checkout.

## F1 — Format suffix plus trailing slash bypasses the logout path denial

Severity: medium as a defense-in-depth policy bypass; downstream exploit impact is conditional. Jump behavior was reproduced with real ES384 signatures and the production origin registry in an in-process Hono request. Rails end-to-end behavior was not executed.

Location: `src/core/redirect_policy.ts:82-95`, especially line 91. The format-suffix branch rejects only suffixes containing no slash. A single trailing slash is otherwise permitted by direct-path validation, so combining two separately tested URL forms defeats the denial.

The probe used ephemeral issuer and Jump keys, `iss=https://auth.umaxica.app`, `aud=https://jump.umaxica.net`, `dst=internal`, schema 1, `rpl=reuse`, and a 30-second lifetime. Destination origin was `https://www.umaxica.app`. Every accepted return token was independently verified with the ephemeral Jump public key, including exact signed target URL binding.

| Signed target pathname | Observed HTTP status | Fresh valid Jump signature |
| ---------------------- | -------------------- | -------------------------- |
| `/sign/out`            | 400                  | No                         |
| `/sign/out/`           | 400                  | No                         |
| `/sign/out.html`       | 400                  | No                         |
| `/sign/out.json`       | 400                  | No                         |
| `/sign/out.html/`      | 302                  | Yes                        |
| `/sign/out.json/`      | 302                  | Yes                        |
| `/sign/out%2ehtml/`    | 302                  | Yes                        |
| `/sign/%6fut.html/`    | 302                  | Yes                        |

The public URL validation functions also accepted `/sign/out.html/` on all 12 denylisted origins. This was not a forged token or an origin-allowlist bypass: exploiting this navigation path requires obtaining a valid issuer instruction for the URL.

Rails relevance: `config/routes/base.rb:114-116` exposes the singleton GET show route with the implicit format suffix; `Base::App::SignOutsController#show` continues or completes logout. Rails `RouteSet#call` normalizes paths before routing, and `Journey::Router::Utils.normalize_path` removes a trailing slash. This was verified in the locally available Rails source `a19f07f3502f` and current official upstream source. The application's locked Rails revision is `48dc419a790893357ba0c4b49ed6c4d043dbeb9c`; that exact revision and deployed routing behavior could not be verified. Therefore routing to the same action in the actual application remains an integration inference.

The current Rails completion code checks active session context, notice state, surface and constant-time state equality before consuming a notice (`app/controllers/concerns/oidc_rp_logout_launcher.rb:147-171`). No unauthenticated forced logout, state-check bypass, or external open redirect was demonstrated. Some normalization differences may instead cause receiver URL mismatch and rejection.

Suggested correction: include the single trailing-slash variant in format-suffix matching, while preserving the distinction between `/sign/out.html/` and unrelated descendants. Add signed-request tests for both combinations and execute the exact Rails route/receiver cases before rollout.

Minimal local reproduction, through public functions:

```sh
pnpm exec node --import tsx --input-type=module -e '
import { normalizeUrl, validateInternalTarget } from "./src/core/normalize_url.ts";
console.log(validateInternalTarget(normalizeUrl(
  "https://www.umaxica.app/sign/out.html/",
  { edge: "cloudflare", production: true },
  "https://jump.umaxica.net"
)).href);
'
```

Observed: returns the URL rather than throwing. The fuller signed-request probe was executed as `pnpm exec node --import tsx scripts/asvs-probe.ts` in the snapshot, covering the eight cases above and the 12-origin validation check.

ASVS mapping: v5.0.0-2.2.1 and 1.1.1 (validation and interpretation boundary); 3.5.3 is relevant to the receiver's stateful GET actions, not a claim of proven CSRF exploitation.

## F2 — Rails return verification can force repeated JWKS retrieval before rate limiting

Severity: medium, source-confirmed control gap; resource-exhaustion impact is unmeasured and depends on deployed upstream protections.

Locations in the Rails checkout:

- `app/controllers/auth/app/application_controller.rb:59-75` and `app/controllers/base/app/application_controller.rb:70-86`: return verification is registered before the surface-wide rate limiter.
- `app/controllers/concerns/jump_rt_return_verification.rb:15-51`: failed verification renders 400, ending controller processing before the later rate-limit callback.
- `app/values/jump_rt_return_verifier.rb:104-110,121-129`: each previously unseen `kid` triggers forced JWKS retrieval, which deletes the shared JWKS cache. Negative caching is per kid, so changing kid evades it. No issuer-wide refresh cooldown or in-flight coalescing is present in this verifier.

An attacker can send syntactically valid compact tokens with `typ=JWT`, `alg=ES384`, a fresh unknown kid and an invalid signature directly to a reachable Rails receiver. Key selection/fetch occurs before signature verification. A valid issuer or Jump signature is unnecessary for this work. This can repeatedly occupy outbound connections, evict a warm cache and consume cache entries; the Jump entry's limiter does not cover requests sent directly to Rails. The configured default Rails controller limiter is positioned too late to protect this path.

This finding was established by tracing code, not by a live load test or a booted Rails integration test. Earlier callbacks, edge/WAF limits and actual deployment exposure were not fully verified and can reduce impact.

Suggested correction: enforce a receiver-entry limit before JWT/JWKS work, bound refresh frequency per configured JWKS source, coalesce concurrent fetches, and avoid evicting a usable keyset on arbitrary unknown kid input. Verify using many distinct kids, unavailable JWKS and concurrent valid returns in the real Rails runtime.

ASVS mapping: v5.0.0-2.4.1.

## Controls checked and remaining responsibility

| Area / ASVS 5.0.0 reference                              | Current evidence                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Token integrity, algorithm and trusted keys: 9.1.1–9.1.3 | Jump fixes ES384/P-384, selects only registered issuers, denies unsupported JOSE members, and bounds token/key input. Existing JWT and key-material unit tests passed.                                                                                                                                                         |
| Time, purpose and audience: 9.2.1–9.2.4                  | Jump verifies explicit claims, scalar audience, 30-second structural TTL and 5-second clock tolerance. Production uses `typ=JWT` with issuer/audience/schema/sub separation; staging uses dedicated request/return types. No cross-token acceptance bypass reproduced.                                                         |
| Redirect destinations: 3.7.2, 2.2.1                      | Fixed directed origin graph, 13 nodes, 20 allowed and 149 denied pairs is tested. External destinations, userinfo, prohibited IPs, malformed paths and generic secondary-redirect parameters are rejected. F1 remains.                                                                                                         |
| SSRF: 1.3.6                                              | Destination URL is never fetched. Only registry-pinned HTTPS issuer JWKS is fetched, redirects are refused, response reading is capped at 64 KiB, key count is bounded, and request deadlines apply.                                                                                                                           |
| Browser isolation / data exposure: 3.2.1, 3.4.1–3.4.6    | Existing tests cover navigation metadata, no-store, no-referrer, CSP, framing, no-cookie responses, redacted errors/logging, and deadline behavior. Real browser and platform log behavior remain unverified.                                                                                                                  |
| Rails signed URL binding                                 | Current receiver uses ordered `UrlSearchParamsValue`, rejects repeated/nested rt and compares the signed URL before removing the return token. The historical Rack Hash differential described in Jump docs is not the current implementation. Rails runtime acceptance remains unverified.                                    |
| Secondary OAuth redirects                                | Jump preserves some nested OAuth/native callback URIs; acceptance is not client registration approval. Rails `OidcAuthorizeRequestResolver` calls the registry, and `OidcRedirectUriPolicy` uses exact registered URI membership. The complete authorization/code/state/nonce/PKCE/logout transaction flows were not executed. |
| Replay and authentication                                | Reusable RT and fresh outbound jti authorize navigation only. They are not login, CSRF approval or one-time transaction evidence. Receiver-owned state and idempotency remain mandatory.                                                                                                                                       |
| Abuse resistance: 2.4.1                                  | Jump has bounded issuer cache/refresh and adapter rate limiting; a limiter call exception intentionally continues verification. Rails has F2. Production rate-limit effectiveness is unverified.                                                                                                                               |
| Dependencies and operations                              | Advisory audit blocked; CI, deployed revision, key isolation/revocation, TLS, proxy headers, live bindings and log redaction not verified. No production safety conclusion.                                                                                                                                                    |

## Executed checks

Commands below used cached pnpm 12.0.0 and the isolated current-source snapshot.

| Command                                 | Result                                                                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run test`                         | PASS: 19 files, 1,307 tests; 3.04 seconds reported by Vitest.                                                                                  |
| `pnpm run format:check`                 | PASS: 161 files.                                                                                                                               |
| `pnpm run lint:check`                   | Exit 0, one existing warning at `src/core/normalize_url.ts:31` (`typescript(no-non-null-assertion)`).                                          |
| `pnpm run typecheck`                    | PASS.                                                                                                                                          |
| Signed-request adversarial probe        | Reproduced F1: four denied controls, four accepted/signature-verified bypass variants; 12/12 origins accepted the format-plus-slash variant.   |
| `pnpm run test:worker`                  | BLOCKED before runtime assertions: `listen EPERM 127.0.0.1`.                                                                                   |
| `pnpm run test:e2e`                     | BLOCKED before browser cases: web server `listen EPERM 127.0.0.1:4173`.                                                                        |
| `pnpm audit --json`                     | BLOCKED: `ERR_PNPM_AUDIT_BAD_RESPONSE`, registry advisory endpoint DNS failure. No zero-vulnerability conclusion.                              |
| Rails container discovery (`podman ps`) | BLOCKED: `/run/user/1000/libpod` read-only/sticky-bit configuration error. No Rails tests were run; no containers were restarted or recreated. |
| `git diff --check`                      | PASS before adding this record.                                                                                                                |

The audit leaves the implementation unchanged so the reproduced behavior remains reviewable. F1 needs correction and F2 needs receiver-side mitigation or verified equivalent protection; blocked runtime/integration checks remain open.

Final handoff checks with this record included in the isolated snapshot: `pnpm run format` passed (162 files), `pnpm run lint` exited 0 with the same warning, `pnpm run typecheck` passed, and `pnpm run test` again passed all 1,307 tests in 19 files (3.02 seconds). A SHA-256 comparison of all 170 original snapshot inputs found no changes in either the original checkout or the snapshot after these commands. The signed probe source was retained outside the snapshot at `/tmp/jump-asvs-signed-probe.ts` after execution.

## Primary references retrieved

- [OWASP ASVS releases](https://github.com/OWASP/ASVS/releases): latest stable release is 5.0.0; rolling master is a preview.
- [ASVS 5.0.0 source](https://github.com/OWASP/ASVS/tree/v5.0.0/5.0/en): V1, V2, V3, V9, V10 and V15 consulted. Requirement IDs above are version-qualified.
- [Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).
- [Rails path normalization](https://github.com/rails/rails/blob/main/actionpack/lib/action_dispatch/journey/router/utils.rb) and [routing entry](https://github.com/rails/rails/blob/main/actionpack/lib/action_dispatch/routing/route_set.rb). These upstream links are not proof of the application's locked/runtime revision.
