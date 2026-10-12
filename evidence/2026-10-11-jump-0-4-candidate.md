# Jump 0.4.0 local candidate evidence

Date: 2026-10-11 (Asia/Tokyo). Decision: **RELEASE_BLOCKED**.
Baseline local HEAD: `0e0b3c62057ecfdf373dc463853efa7fe7255ba6` (develop).
Initial `git status --short` was empty. Package and SERVICE were 0.3.0.
Candidate code/package/receiver fixture now consistently identify service 0.4.0;
JWT schema remains 1. The candidate is uncommitted, not that baseline SHA.
`.git` is mounted read-only; no commit/push/deploy/remote setting or key operation
was performed. Review phase groups and all fifteen gates in
[the release packet](../docs/operations/jump-0-4-release-gates.md).

## Baseline and RED/GREEN

- Read AGENTS, ADR 0007, internal-only plan/contract, protocol/security/receiver/
  compatibility/release-closure docs, dated memos/evidence, source and tests.
- `jump-0.4.0-strategic-review.md` was absent in this checkout and surrounding
  repository file inventory. The user does not know its location. Its content
  was not inferred; receipt/reconciliation remains NOT VERIFIED.
- Existing runtime already rejects external/unknown/missing/malformed dst.
  Production registry is 13 nodes, 20 permitted edges, 149 denied pairs, with
  no external policy field. Dormant renderer exists. No unsafe code restored.
- Baseline `pnpm run test`: 17 files / 1,190 tests passed using the installed
  exact pnpm 12.0.0 executable. This is local evidence, not production evidence.
- Before implementation, added direct pathname cases accepted by existing code:
  `/a//b`, `/a/../b`, `/a/%2e%2e/b`, `/a/%2F/b`, `/a/%25/b`, `/a;b` produced six
  actual assertion failures (RED). Encoded backslash was already refused.
- After implementation, those cases, positives, independent OAuth queries,
  encoded rule bypasses, Rails format suffixes, C1 controls and signed request
  regressions pass. The complete suite passed with 1,295 tests across 19 files.
  No coverage threshold, signature check, TTL or graph was weakened.

## Toolchain and completed checks

All pnpm invocations used the pre-existing executable
`/home/mslo/.local/share/mise/installs/pnpm/12.0.0/pnpm`, abbreviated below as pnpm.
Default PATH pnpm 12.4.2 initially failed with ERR_PNPM_BAD_PM_VERSION. No
package-manager policy bypass or downloaded replacement was used. Node was
v24.21.0; package engines now pins 24.21.0, matching CI's existing version-file
setup. The lockfile was not changed.

Changing package metadata caused a later script invocation to start automatic
dependency reinstallation; network DNS failures prevented fetching and it was
interrupted. `pnpm install --frozen-lockfile --offline` then restored the exact
118 packages from the existing store: reused 118, downloaded 0, exit 0. The
command reported the cached supply-chain policy verification (54 minutes old);
this does not prove a fresh vulnerability audit. `.npmrc`, minimumReleaseAge
4320, ignoreScripts and denied dependency builds were retained.

| Command                                                                                           | Observed result                                                                                                                                     |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run format` and `pnpm run format:check`                                                     | PASS; existing README/four historical evidence Markdown indentation repaired, with no factual changes                                               |
| `pnpm run lint` and `pnpm run lint:check`                                                         | PASS, no remaining warnings after fixes                                                                                                             |
| `pnpm run typecheck`                                                                              | PASS                                                                                                                                                |
| `pnpm run test`                                                                                   | PASS, 19 files / 1,295 tests in final handoff run                                                                                                   |
| `pnpm run test:cov`                                                                               | PASS, 19 files / 1,295 tests; statements 99.66%, branches 99.26%, functions 100%, lines 99.71%; existing 99% gates retained                         |
| `KNIP_DISABLE_RAW_TRANSFER=1 pnpm exec knip --include unlisted,unresolved,binaries`               | PASS; two redundant entry configuration hints, no blocking findings                                                                                 |
| `WRANGLER_LOG_PATH=/tmp/jump-wrangler-logs WRANGLER_SEND_METRICS=false pnpm run cloudflare:check` | PASS, Wrangler 4.148.0, top-level production dry-run; 291.59 KiB upload / 71.35 KiB gzip; multiple-environment warning, no deployment               |
| `git diff --check`                                                                                | PASS                                                                                                                                                |
| `pnpm run test:worker`                                                                            | BLOCKED, Miniflare internal TCP listener failed with listen EPERM on 127.0.0.1 before runtime assertions                                            |
| `pnpm run test:e2e`                                                                               | BLOCKED, Node web server listen EPERM on 127.0.0.1:4173 before browser assertions                                                                   |
| `pnpm audit --audit-level=high`                                                                   | BLOCKED, configured npm.flatt.tech bulk audit endpoint failed DNS/connect; ERR_PNPM_AUDIT_BAD_RESPONSE; no audit ignore/override or registry change |
| `pnpm exec gitleaks version`                                                                      | BLOCKED, gitleaks executable not installed; no completed secret-scan claim                                                                          |
| `gh run list --branch develop --limit 3 --json headSha,status,conclusion,url`                     | BLOCKED, cannot connect to api.github.com; no current CI conclusion obtained                                                                        |
| Public read-only `jump.umaxica.net/health.json` and `/about`                                      | NOT VERIFIED, browsing tool could not fetch; no production version/config/usage evidence obtained                                                   |
| `podman ps --format '{{.Names}}'`                                                                 | BLOCKED, rootless runtime /run/user/1000/libpod was read-only; no containers started or recreated and no Rails runtime test performed               |

The first dry-run bundled successfully but attempted an unwritable default log
path. The explicit /tmp log path rerun passed without that filesystem error.
Generated bundle is local candidate evidence, not a tested immutable recovery
version or deployed artifact:
`cloudflare.js SHA256 cba48d458f1a7fd546682de8c43774ca0fb957cd5f670b18594837f46fb7ec13`.
Receiver fixture SHA256:
`0db02b9412487931465a81e5e292e7bc6f0ca3eb06a1296e558348772cdadb9a`.
Production graph fixture SHA256 (unchanged):
`3e93ca422c35be5bb034d797ae61ddc9d0befcfd431ba12e3e859a43611588ab`.

## Actual receiving-route source review

Read-only Rails checkout `umaxica-apps-global`, HEAD
`2a1644f73238839ed7ed513bd4681ea393a86682`; no Rails code was changed.
Reviewed config/routes/{auth,base,core,warp,palm}.rb and corresponding logout
controllers, OidcRpLogoutLauncher, OidcClientRegistry, OidcRedirectUriPolicy,
OidcAuthorizeRequestResolver and relevant token-exchange binding checks.

| Origins / actual routes                                                                                             | Observed source behavior / candidate decision                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base app/com/org `/sign/out`                                                                                        | show continues browser logout or calls complete_oidc_rp_logout!, consuming notice state; deny exact/trailing slash/Rails implicit format routes              |
| Core app/com/org and Warp app/com/org `/sign/out`                                                                   | same GET completion/continuation; deny at their exact canonical graph origins                                                                                |
| Auth app/com/org `/sign/out`                                                                                        | show renders confirmation with challenge or redirect_to_base_sign_out! issues Jump RT to Base `/sign/out`; deny this secondary forwarding route              |
| Palm `/sign/out`                                                                                                    | show checks transaction/state and renders notice; create starts coordinator; no GET state mutation found in inspected action; not denylisted                 |
| Base `/oauth/authorize`, `/oidc/callback`, `/oidc/logout`; Core/Warp/Palm `/oidc/callback`; Auth provider callbacks | protocol routes identified; not indiscriminately denied or classified safe solely by origin; registration/receiver/issuer-owner integration remains required |
| RP `/sign`                                                                                                          | route comments and definitions distinguish neutral GET page from POST start; not blanket-denied                                                              |

OidcRedirectUriPolicy uses exact Array#include? URI matching and realm-specific
membership when supplied. Authorization resolver requires code, S256, state,
nonce and client/realm URI validation. Token exchange checks redirect_uri against
code payload and registration. This is source-level evidence only: live realm
configuration, code-flow tests, emitted RT path inventory, complete route safety,
30s receiver acceptance, parser parity, actual JWKS Cache-Control and rotation
remain NOT VERIFIED. No invented paths were added for a count target.

The existing Auth→Base `/sign/out` RT issuance is a concrete compatibility
blocker: the candidate deliberately refuses it. A proven coordinated route
contract or flow redesign is required; do not loosen signature/origin/path
controls just to restore availability.

## UI and standards review

About/Health share the product CSS; all invalid/method/rate/unavailable/deadline/
internal-error screens share splash CSS. Light's paper/ink design is retained;
muted text/control contrast and focus/reading spacing improve. OS Dark uses only
CSS custom properties and prefers-color-scheme; no cookie/query/storage/theme JS
or theme button. Existing back script and its independent CSP hash are retained.
Worker, standalone HTML and public/_headers CSP hashes pass existing checks.

Palette tests evaluate exported actual CSS values: normal/muted/alert/action text
pairs meet 4.5:1 and control/focus pairs meet 3:1 in both modes. Existing keyboard
controls remain native links/buttons with visible focus. Playwright cases cover
all five screen classes at 320px/1280px, Light→Dark→Light without navigation,
CSP console rejection and overflow; they have NOT executed because of listen
EPERM. Rendered layout, OS-change behavior, keyboard and assistive-technology
use, color perception and full WCAG 2.2 conformance are not proven by palette
checks. No accessibility certification is claimed.

Retrieved OWASP ASVS project page and tagged 5.0.0 requirements on this date:
latest stable is 5.0.0; master/bleeding-edge is not the audit basis. Relevant IDs
and primary references are in [redirect policy](../docs/redirect-policy.md).
Also reviewed RFC 9700, RFC 8252, RFC 8725, WHATWG URL, OWASP redirect cheat sheet,
CWE-601, WCAG 2.2, IANA example domains and Cloudflare Workers best practices/
Wrangler command docs. Scoped review does not establish full conformance.

## Unclosed gates and retained capability

ADR 0007 Phase 3 is not complete: no deployed-version/non-use observation window
or Phase 2 production verification exists. Dormant cushion renderer/IDNA/script/
CSP and shared resources remain; external runtime requests still fail closed.
No Away forwarding exists. All fifteen release conditions remain mandatory;
production settings, immutable rollback, current CI, fresh dependency/secret
scan, runtime/browser and Rails owner evidence must close before release.

## Candidate validation input identity

Baseline SHA plus dirty-tree state is not an immutable candidate SHA. The tested
source/config manifest has 74 files: all git-listed tracked/untracked files under
src/, test/, e2e/, scripts/, public/, .github/ plus package.json, pnpm-lock.yaml,
pnpm-workspace.yaml, .npmrc, tsconfig.json, vitest.config.ts, playwright.config.ts,
wrangler.jsonc and knip.json. Sort paths lexically, concatenate each UTF-8 path,
NUL, file bytes, NUL and SHA256 the result:
`6a47ff1fed8215a071af66255e67c3e66a6d9b6eb1b8830a716249223b686947`.
Documentation/evidence is excluded to avoid self-referential hashing. This
fingerprint identifies validation inputs; it is not a release artifact or commit.
