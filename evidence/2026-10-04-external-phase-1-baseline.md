# External removal Phase 1 baseline investigation

Date: 2026-10-04. Verdict: **PHASE_1_NOT_VERIFIED**.

## Repository baseline and scope

- Branch: `develop`.
- Audited HEAD: `3c84a39430b7740c1563dcff3d593e058843b5da`.
- Initial `git status --short`: empty. Tracked diff remained empty after investigation.
- Only this evidence record was added. No runtime, configuration, schema, test,
  fixture, ADR, signing, `/about`, or Away changes; no commit, push, or deploy.

## Registry: statically confirmed

Read `src/config/registry.umaxica.ts`, `src/cloudflare.ts`, `src/index.ts`,
`src/core/policy.ts`, and `src/core/verify_jwt.ts`.

A read-only Python source enumeration compared the literal node/edge tables with
`test/fixtures/production-graph.json`. Assertions passed: 13 unique nodes,
20 unique edges, identical fixture, and 149 remaining ordered pairs. The builder
assigns `allowed_dst_external: false` to every node, with no other assignment to
that field in the registry source. This was static verification, not execution
of the TypeScript registry or application tests.

The Worker directly imports this registry and passes it to `createApp`. No
registry override or external-enablement env/binding path was found in the
production adapter. The generic app accepts injected registries; test fixtures
use that capability. No global external kill switch exists. Changing bundled
issuer policy to an external origin array can still enable cushion success.

## Existing response contracts: read, not executed

`test/production-contract.test.ts` independently freezes the graph and checks
all 13 issuer external policies. Its signed external test loops over all
issuers using issuer-specific nonproduction keys. The shared denial assertion
requires 400 `invalid_request`, no Location, and security hygiene. Successfully
tested issuer count in this run: **0**, because pnpm never launched the tests.

The existing external loop does not explicitly assert absence of cushion body
markers. Source tracing shows denied policy goes to the public error renderer;
cushion rendering follows successful policy only. Body absence remains an
unexecuted contract, not a measured result.

The existing graph test checks 20 permitted and 149 rejected pairs through
policy. The adapter success tests exercise the 20 edges, 302 Location, one
outbound RT, ES384 signature/header, issuer/audience/source/destination/schema/
reuse/subject, exact required claims, query preservation, fresh jti, and receiver
TTL (30 seconds). These semantic assertions were reviewed, not run. No token
snapshot was created. Schema 1 and required dst are unchanged.

## Caller audit

- Rails confirmed: `app/lib/jump_rt_issuer.rb` accepts internal/external, defaults
  to internal, and passes dst to its payload builder. `CommonRedirect` forwards
  dst into issuance. `RedirectsJumpGatewayUrl` builds the browser-facing gateway
  URL without inspecting the token's dst. Palm logout uses default internal.
- Rails not found: explicit external dst usage in the searched application
  callers. This is not proof of production non-use.
- Rails not proven: dynamic keywords through `redirect_to_surface_url`,
  `redirect_to_oidc_authorization_url`, and `redirect_to_sign_in_sequence!` can
  reach the common helper. The inspected login-required options are internal
  defaults, but all dynamic call chains and deployed caller revisions were not
  proven.
- Edge not found: direct Jump RT issuer or explicit external Jump caller in the
  searched Edge source/test tree (excluding docs, plans, evidence, and lockfile).
- Jump confirmed: `test/fixtures/registry.example.ts` and individual tests enable
  external origins and exercise cushion success. Production does not select the
  fixture. These tests and fixtures remain intact.
- Docs confirmed: README/protocol/security/FAQ retain the current cushion flow.
  ADR 0007 remains proposed; it combines runtime rejection and physical removal
  rather than documenting the three production-gated phases. No ADR edit made.
- No Jump-to-Away forwarding path was found; none was added. Away was not edited.

## Production revision, CI, and usage gaps

- Read-only Cloudflare connector `workers_get_worker` for
  `umaxica-apps-edge-jump` returned `Cloudflare API request failed`.
- Connector `workers_list` succeeded but its returned 11-worker inventory did
  not contain Jump. This does not prove Jump is absent from production; target
  account/visibility coverage is unverified. Deployed version and Git revision
  are unknown; no audited-vs-deployed diff can yet be established.
- Safe shell GET of `https://jump.umaxica.net/health` failed with curl exit 6,
  host resolution failure, and no HTTP response. The web tool also reported the
  endpoint inaccessible. Health would not by itself establish a Git revision.
- `gh api repos/seahal/umaxica-apps-edge-jump/actions/runs?head_sha=3c84a39430b7740c1563dcff3d593e058843b5da&per_page=10`
  could not connect to api.github.com. Connector commit-workflow lookup returned
  an empty PR-only run list; combined-status lookup returned no statuses. These
  limited results do not establish absence of push runs or CI success.
- Source observability supports sanitized `jump_accept`/`jump_reject` events
  with dst, status, and result. Historical production logs/metrics were not
  accessible through the available connector; no observation window or event
  counts were obtained. Neither external success nor non-use is proven.
- No production tokens, secrets, credentials, or raw production logs were
  retrieved. No probing with signed production requests was performed.

## Validation execution and environment side effect

Commands were taken from package.json and `.github/workflows/integration.yaml`.
The default executable was pnpm 12.4.2; the repository requires 12.0.0 with
`pmOnFail: error`.

| Command | Actual result |
| --- | --- |
| `pnpm run format:check` | Default pnpm rejected version, exit 1, before tool startup. Retried with installed pnpm 12.0.0; dependency tarball retrieval hit registry DNS failure before oxfmt startup; interrupted, exit 130. |
| `pnpm run lint:check` | Default pnpm rejected version, exit 1; oxlint did not start. |
| `pnpm run typecheck` | Default pnpm rejected version, exit 1; tsc did not start. |
| `pnpm run test` | Not attempted after dependency side effect; no unit result. |
| `pnpm run test -- test/production-contract.test.ts` | Not attempted; existing production contracts not executed. |
| `pnpm run test:cov` | CI command reviewed; not attempted. |
| `pnpm run test:worker` | Not attempted; no workerd result. |
| `pnpm run test:e2e` | Not attempted; no E2E result. |
| `KNIP_DISABLE_RAW_TRANSFER=1 pnpm exec knip --include unlisted,unresolved,binaries` | CI command reviewed; not attempted. |
| `pnpm audit --audit-level=high` | CI command reviewed; not attempted; no current dependency audit result. |
| `pnpm outdated` | CI informational command reviewed; not attempted. |
| `pnpm run cloudflare:check` | Not attempted; no dry-run result. |
| CI secret-scan | Workflow reviewed; remote result not established. |

The retry used `/home/mslo/.local/share/mise/installs/pnpm/12.0.0/pnpm` without
changing version policy. It attempted dependency retrieval from npm.flatt.tech
as part of run startup, reporting `dns error: no connections available`.
Before the retry, `node_modules/.bin` contained validation executables including
vitest and oxfmt. After the retry, that directory no longer existed. The process
was interrupted and further pnpm checks were stopped. This is an unexpected
ignored-dependency mutation despite no source/lockfile diff. No dependency
repair, reinstall, policy bypass, or alternate-toolchain test run was performed.

## Follow-up boundaries

Phase 1 cannot be declared complete: local/CI green, executed external/internal
contracts, and deployed revision/usage evidence remain unverified. Recover the
dependency environment under the established pnpm policy before retrying formal
validation; establish access to the actual production account and its deployed
artifact provenance. Do not deploy merely to match this checkout.

Phase 2 recommendation only: first RED tests with external-enabled fixture and
properly signed external RT; require non-3xx, no Location, no cushion markers,
no Away forwarding, no internal fallback, and no outbound signing. Retain the
existing internal semantic contracts. Cover missing/undefined, null, empty,
whitespace, 0, wrong types, unknown/case variants, NUL and encoded anomalies.
Maintain schema 1 and required dst. No Phase 2 tests or runtime changes added.

Phase 3 recommendation only: remove actual dormant external code after Phase 2
production verification, retaining permanent rejection tests and shared URL,
IDNA, page styles, and header behavior until their remaining uses are reviewed.
ADR 0007 should eventually describe Phase 1 baseline verification, Phase 2
runtime enforcement, and Phase 3 removal; its status was not changed here.
