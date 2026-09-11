# Repository instructions

## pnpm workflow

- Use pnpm exclusively for dependency management and task execution.
- Install with `pnpm install --frozen-lockfile` in CI and `pnpm install` when intentionally updating the lockfile.
- Run tools through `package.json` scripts (`pnpm run <script>`) or `pnpm exec <binary>`.
- Do not use npm, Yarn, Corepack, Vite+, or the legacy unified-toolchain command.
- Before handoff, run format, lint, typecheck, and unit-test scripts.

## Evidence

Completed tests, validations, verifications, audits, security checks and
performance checks leave a short record in `evidence/` when retaining the result
is useful. Records describe work that was actually performed — never plans,
intentions, or unverified claims. A check that could not be completed is
recorded as such, with the reason and whatever was observed.

- `evidence/` is flat; no subdirectories.
- Only `.md` files.
- `YYYY-MM-DD-<topic>.md`, ISO date, lowercase hyphenated topic.
- No raw logs, screenshots, binaries, archives, dumps, generated reports or
  other large artifacts. Summarize them, and cite the commands, identifiers,
  hashes, measurements and excerpts that carry the result.
- Enforced by `pnpm run test` (`test/evidence-layout.test.ts`).

## Design principle

Follow YAGNI: implement only current requirements and avoid speculative abstractions.
