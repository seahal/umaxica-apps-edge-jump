# Local CI check before pushing develop

Date: 2026-10-06. Verdict: **WOULD_FAIL_CI_IF_PUSHED**. No fix was applied; the
decision was to leave the implementation unchanged for now.

## Baseline and scope

- Branch: `develop`; HEAD: `1cbec980fbc030c508f574e0521cd2467c5b44a6`, two
  commits ahead of `origin/develop` (`1377f8a55f7d934c229bdf02f431377aa9651525`).
- Worktree had uncommitted changes in `e2e/smoke.spec.ts`, `public/_headers`,
  `src/core/i18n.ts`, `src/core/page.tsx`, `src/core/security_headers.ts` and
  `test/jump.test.ts`. They were left as they were.
- Only this evidence record was added. No runtime, test, configuration or
  document changes; no commit, push or deploy.

## Remote CI state

`gh run list --limit 10` showed every recent run as success, including CI on
`main` for the merge of PR #54 (run `37041165206`, 2026-10-02). The latest
failures listed by `gh run list --status failure` are from 2026-10-02 (PR #51
and #52, for example run `37016227089`) and precede the green runs. No open pull
request exists. Remote CI is therefore not failing; the failures below exist
only in unpushed local work.

## Local checks performed

The default `pnpm` on this machine is 12.4.2 and is rejected with
`ERR_PNPM_BAD_PM_VERSION` because `packageManager` pins 12.0.0. The four checks
were run through the binaries in `node_modules/.bin`, on Node v24.21.0. The unit
tests were then repeated by the user with the pinned
`~/.local/share/mise/installs/pnpm/12.0.0/pnpm test`, with the same result.

| Check                   | Result | Observation                       |
| ----------------------- | ------ | --------------------------------- |
| `oxfmt . --check`       | FAIL   | 5 of 139 files have format issues |
| `oxlint --type-aware .` | PASS   | exit 0, no output                 |
| `tsc --noEmit`          | PASS   | exit 0, no output                 |
| `vitest run`            | FAIL   | 2 failed, 574 passed, 576 total   |

Files reported by the format check:

- `README.md`
- `docs/internal-only-gateway.md`
- `evidence/2026-10-04-external-phase-1-baseline.md`
- `plans/jump-internal-only.md`
- `plans/pasted-content-id-bb9d-ls-reflective-prism.md`

Failing unit tests, both in `test/internal-only.test.ts` (27 tests, 25 passed):

- `C: allowlisted external is rejected without signing or navigation`
- `D: external with allowed internal URL is rejected without signing or navigation`

Both fail at `expectDenied` (`test/internal-only.test.ts:78`) with
`AssertionError: expected 200 to be 400`. The harness started and the request log
shows `GET / 200`, so the failure is the runtime returning the external cushion
page, not a startup error. With the uncommitted changes stashed, the same file
still reported 2 failed and 25 passed, so the failure comes from committed HEAD
(`1cbec98` added the tests) and not from the worktree changes.

## Interpretation

Cases C and D are the Phase 2 rejection tests of
`plans/jump-internal-only.md` for ADR 0007, which is still proposed. The runtime
still accepts `dst: external` for an external-enabled injected registry, as
`evidence/2026-10-04-internal-only-tdd-blocked.md` predicted from source. This
run is the first time that failure was actually observed. It is not recorded as
the Phase 2 RED step: Phase 1 remains unverified and Phase 2 has not been
resumed.

## Not performed

The remaining CI steps were not run locally: knip, `test:cov`, `test:worker`,
`test:e2e`, `pnpm audit`, `pnpm outdated` and `cloudflare:check`. Their state for
this HEAD is unknown.

## Later worktree change

After the checks above, the worktree changed outside this check: the five files
listed by the format check were reformatted, and `package.json`,
`pnpm-lock.yaml` and `pnpm-workspace.yaml` received dependency updates (for
example `vitest` 5.0.2 to 5.0.3 and `hono` ^4.13.11 to ^4.13.12). A repeated
`oxfmt . --check` then passed on 140 files. Lint, typecheck and the full unit
suite were not repeated after the dependency updates.

## Open items

- Pushing `develop` will still fail CI at the unit tests.
- The format failure is resolved in the worktree but not committed.
- C and D stay red until either the external rejection is implemented under a
  resumed Phase 2 or the two cases are explicitly deferred.
