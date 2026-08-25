# Repository instructions

## pnpm workflow

- Use pnpm exclusively for dependency management and task execution.
- Install with `pnpm install --frozen-lockfile` in CI and `pnpm install` when intentionally updating the lockfile.
- Run tools through `package.json` scripts (`pnpm run <script>`) or `pnpm exec <binary>`.
- Do not use npm, Yarn, Corepack, Vite+, or the legacy unified-toolchain command.
- Before handoff, run format, lint, typecheck, and unit-test scripts.

## Design principle

Follow YAGNI: implement only current requirements and avoid speculative abstractions.
