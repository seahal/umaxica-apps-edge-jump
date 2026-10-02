# Key rotation runbook review

Rewrote `docs/operations/key-rotation.md` in plain English and aligned the key
recovery paragraph in `docs/operations/rollback-recovery.md` with recovery using B.
Reviewed the local generator, public-JWK validation, private/public probe check,
outbound TTL, and receiver contract. Consulted Cloudflare's official Worker
secrets and rollback documentation linked in the runbook.

The procedure separates normal prepublication/activation/retirement from
emergency receiver-side revocation. It requires measured cache/propagation
bounds and distinguishes private-key disposal from public-key grace.
No keys were generated and no production operation or receiver test was run.
The recovery artifact and production timing bounds remain unverified.

Validation used the installed pnpm 12.0.0 binary at
`/home/mslo/.local/share/mise/installs/pnpm/12.0.0/pnpm`, with the command-local
`--config.verify-deps-before-run=error` guard:

| Command suffix     | Result                                               |
| ------------------ | ---------------------------------------------------- |
| `run format:check` | Blocked before execution: dependencies not installed |
| `run lint:check`   | Blocked before execution: dependencies not installed |
| `run typecheck`    | Blocked before execution: dependencies not installed |
| `run test`         | Blocked before execution: dependencies not installed |
| `git diff --check` | Passed                                               |

Each guarded pnpm command returned `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` and
"the lockfile requires dependencies but none were installed". An initial
unguarded `pnpm run format:check` invocation produced no result while waiting.
No successful formatter, lint, typecheck, or unit-test execution is claimed.
Existing unrelated changes were preserved.
