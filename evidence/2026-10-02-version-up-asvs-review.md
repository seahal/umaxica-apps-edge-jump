# Version-up ASVS, documentation and CI review — 2026-10-02

Branch `feature`, HEAD `2f1aeb434732eca11c978969052a634a79b46f5a`, on top of the
existing uncommitted working tree. Selected OWASP ASVS 5.0 areas (V1/V2
validation, V3/V4 headers and HTTP, V8 redirect authorization, V9/V11 tokens and
crypto, V12/V13 JWKS transport and configuration, V16 logging/errors) were reviewed
by reading `src/**` and `wrangler.jsonc`. This is not a certification or a
production penetration test. Dependency advisories (`pnpm audit`) were out of scope.
Production acceptance was reported by the owner as done in the pre-deploy and
was not repeated here.

Later the same day, the `/ready` endpoint and the key-material backoff described
below were removed by owner decision; see `2026-10-02-ready-endpoint-removal.md`.

## CI baseline

The latest main run, 37009096725, failed `quality` (format:check), `e2e`,
`worker-runtime` and `dependencies` (audit, out of scope). A local
`pnpm install --frozen-lockfile` followed by every script reproduced format and
e2e failures. `test:worker` already passed with the existing uncommitted
`scripts/test-worker.mjs` change.

## Findings and changes

No Critical or High issue was found. Severity was assigned conservatively.

| Severity           | Finding                                                                                                                                                                      | Change                                                                                                                                                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Low (availability) | `/ready` is unauthenticated and not rate limited. A broken signing configuration was reloaded on every probe (secret read and key import).                                   | `CloudflareKeyMaterialCache` holds a non-deadline load failure for 5 s per bundle key. Test `broken signing configuration is not reloaded on every probe` failed before the fix (2 secret reads) and passes after it. Readiness, threat-model and architecture docs updated. |
| Low (dev hygiene)  | Uncommitted Playwright `outputDir` used the fixed shared path `$TMPDIR/umaxica-apps-edge-jump-playwright`, which another local user could predict. Traces hold request data. | Reverted to the default `test-results/`. Added `test-results/` and `playwright-report/` to `.gitignore`; removed the tracked `.last-run.json` from the index. This supersedes `2026-10-02-playwright-temporary-output.md`.                                                   |
| CI                 | `e2e/smoke.spec.ts` passed `//?rt…` to `request.fetch`, which parses it as a scheme-relative URL (`Invalid URL`).                                                            | The spec now builds the URL from `baseURL`, so `//` stays a path.                                                                                                                                                                                                            |
| CI                 | 5 files failed `format:check`.                                                                                                                                               | Ran `pnpm run format`.                                                                                                                                                                                                                                                       |
| Docs               | `DESIGN.md` was empty and `CONTRIBUTING.md` had no workflow. ADR 0002/0003 had no superseded banner (ADR 0003 states 14 FQDNs; the registry has 13 nodes and 20 edges).      | Added an index to DESIGN.md, the pnpm workflow to CONTRIBUTING.md, and ADR 0005 banners to ADR 0002 and 0003.                                                                                                                                                                |

Reviewed with no defect found: strict query and method prefilters, request-origin
binding, ES384/typ/kid/embedded-key rejection, object-only JSON decode (the earlier
null-header 500 is fixed), TTL and clock checks, the exact edge graph, URL
normalization and private-host rejection, `rt` stripping for internal targets,
pinned same-origin JWKS fetch (manual redirect, content-type, 64 KiB stream cap,
private and duplicate key rejection), negative cache bound and refresh cooldown,
non-extractable private import with pair probe, CSP hashes matching the inline
CSS/script, header parity with `public/_headers`, and log field allowlist, JWT
redaction and path redaction.

Accepted or documented and left unchanged: schema-1 reuse until expiry, the
limiter fail-open on provider exceptions, and a shared key load failing its
waiters when its initiator's deadline fires.

## Workflow scan

`zizmor --offline` (image digest `sha256:a2eb396d886c…`) over `.github/`:
0 high, 0 medium, 6 low. All 6 are `self-repository` style hints for
`./.github/actions/pnpm-project`. They were not applied. The checks pin actions
by SHA, use `permissions: contents: read` and `persist-credentials: false`, and
have no `pull_request_target`.

## Not changed / for owner decision

- ADR 0005 and `docs/compatibility.md` still state `BLOCKED_FOR_ROLLOUT` because
  no rollback artifact is verified. The pre-deploy acceptance was not recorded
  here, so the status was not changed.
- `.npmrc` uses the third-party registry `https://npm.flatt.tech/`. This is a supply-chain trust
  decision; it was not changed.
- `.aiassistant/rules/viteplus.md` mentions a forbidden tool in its filename but
  contains the AGENTS.md text. It was not renamed.

## Executed checks (Node 24.21.0, pnpm 12.0.0)

- `pnpm run format:check`, `lint:check`, `typecheck`: passed.
- `pnpm run test:cov`: 8 files / 459 tests passed; statements 93.77%.
- `pnpm run test:worker`: 20 signed edges and wrong-path, readiness, limiter and deadline contracts passed.
- `CI=1 pnpm run test:e2e`: 16 passed.
- `pnpm run cloudflare:check`: passed; dry run only, no deployment.
- `KNIP_DISABLE_RAW_TRANSFER=1 pnpm exec knip --include unlisted,unresolved,binaries`: passed.
- Remote CI was not rerun; no commit or push was made.
