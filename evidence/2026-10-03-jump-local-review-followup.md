# Jump local review follow-up

Date: 2026-10-03 Asia/Tokyo. Base: develop
`1c946814e5ca78a8d69b48a3029e26da36c29b22`; changes remain uncommitted.
Initial tracked tree was clean. Existing untracked `.aws` was not read or changed.

## Changes inspected

- R05: replaced exception-only negative-cache tests with fetch-count assertions
  for cache hits, expiry/retry, 1024/1025-entry eviction and retention of newer
  entries. Production cache behavior is unchanged.
- R07: added signed JWT cases for a string audience and matching audience arrays;
  removed the misleading coverage exclusion on the exact-string guard. The
  guard itself is unchanged. These tests have not executed in this environment.
- R06: current documents now distinguish the observed main CI from local changes,
  historical local limitations, USER_REPORTED pre-deployment acceptance and
  remaining external gates. Added a Rails-owner handoff without Rails changes.

No dependency, lockfile, registry, trust-policy, runtime protocol, limiter,
signing-material failure-cache or observability-policy change. Previously
deferred cache load risks and accepted platform metadata persistence remain
documented decisions, not findings claimed fixed by these tests.

## Local validation

Used Node 24.20.0 and pnpm 12.0.0 selected explicitly through PATH. Store option:
`--store-dir /home/mslo/Projects/.pnpm-store`. No policy bypass or registry switch.

| Command                                  | Observed result                                                      |
| ---------------------------------------- | -------------------------------------------------------------------- |
| pnpm install --frozen-lockfile --offline | Exit 1: ERR_PNPM_NO_OFFLINE_META for workers-types policy metadata   |
| pnpm install --frozen-lockfile           | Bounded to 25 seconds, exit 124 after registry DNS/connect failure   |
| pnpm run format:check                    | Bounded to 12 seconds, exit 124 during dependency policy/fetch stage |
| pnpm run lint:check                      | Same dependency-stage block, exit 124                                |
| pnpm run typecheck                       | Same dependency-stage block, exit 124                                |
| pnpm run test                            | Same dependency-stage block, exit 124; no unit cases executed        |
| pnpm run test:cov                        | Same dependency-stage block, exit 124; no coverage result            |

`pnpm run` attempted dependency restoration before starting each script. Logs
showed npm.flatt.tech DNS errors; no script pass or RED/GREEN result is claimed.
Restore dependency access, complete frozen install and rerun these commands on
the follow-up candidate. Worker/browser checks were not rerun locally. Audit
advisories remain outside scope; no local audit was run.

`git diff --check` passed. A separate Python filesystem check passed for local
Markdown links in changed/new documents and the flat evidence filename/layout
rules. Byte comparison with HEAD confirmed package.json, pnpm-lock.yaml,
pnpm-workspace.yaml, .npmrc, wrangler.jsonc and the receiver fixture unchanged.
These static checks do not replace formatter, typechecker or unit execution.

## Remote baseline evidence

Read-only GitHub API recheck confirmed main
`7ec79fe6c77af2c253e4ecfc3cc87c3231e4e30d`, with tree
`4c38264df19ab42561fd91555f36e598648b67a8` matching the local base.
[CI run 37034283355](https://github.com/seahal/umaxica-apps-edge-jump/actions/runs/37034283355):
quality, unit, worker-runtime, e2e, secret-scan, cloudflare-dry-run and dependencies
all success. Workers Builds also success. This follow-up rechecked conclusions;
the preceding read-only review inspected logs reporting 544 tests, 20 workerd
signed edges and 16 browser cases. None proves the new uncommitted tests passed.

main remains protected=false; ruleset 16901037 remains disabled. GitHub settings
were not changed. USER_REPORTED acceptance is accepted without production probes.
Specific Rails URL/TTL gaps, deployed configuration and tested immutable recovery
remain external gates; rollout is not declared ready.

## Preservation

Lockfile SHA-256:
`5a217c39a0869e98152b224a69abd2440e344078b50f130a97782b30b8549558`.
Workspace policy SHA-256:
`fee4ae8f36d1fd577668b6921f57aadfd9d4c8d234cc6162d80d233a8887c3eb`.
Receiver fixture SHA-256:
`7f884dcc348ff61cd94643b4dfbc0c5e27caa21fbf570abed81084b59471339e`.

No commit, push, PR, deploy, production request, secret access or remote setting
mutation was performed. Historical evidence was not edited.

## Local validation rerun

Rerun the same day with pnpm 12.0.0 via `pnpm dlx pnpm@12.0.0` (global pnpm
12.4.2; no `pm-on-fail` bypass). Untracked `.aws` was removed by the user first.

| Command                        | Observed result                                            |
| ------------------------------ | ---------------------------------------------------------- |
| pnpm install --frozen-lockfile | Exit 0                                                     |
| pnpm run format:check          | Exit 1 on 3 Markdown files; fixed with oxfmt, rerun exit 0 |
| pnpm run lint:check            | Exit 0                                                     |
| pnpm run typecheck             | Exit 0                                                     |
| pnpm run test                  | Exit 0; 11 files, 549 tests passed                         |

Worker, e2e and coverage checks were not rerun. Release gates remain open.
