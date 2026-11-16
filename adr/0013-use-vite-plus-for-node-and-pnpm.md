# ADR 0013: Use Vite+ for Node.js and pnpm

Status: Accepted (2026-11-17). Supersedes [the mise decision](0012-use-mise.md).

## Context

The developer machine already runs the Vite+ global CLI: its shell setup puts the `node`, `pnpm`
and `bun` shims first on `PATH`, and `vp env` selects the versions a project declares. mise was
installing the same Node.js and pnpm a second time, and the versions were written twice (in
`mise.toml` and in `package.json`). The owner wants the JavaScript toolchain of the Edge
repositories to come from Vite+ alone, with mise and direnv used only for what Vite+ does not
cover.

## Decision

- Vite+ (`vp env`, the global CLI) installs and selects Node.js and pnpm on a developer machine.
  This repository has no `mise.toml`.
- `package.json` is the single source of the versions: `engines.node` for Node.js and
  `packageManager` for pnpm. Vite+ reads both, and CI reads the same fields, so a version change is
  one edit. `package.json` has no `devEngines`, so pnpm never downloads its own copy.
- The project-local `vite-plus` devDependency provides `vp dev`, `vp build`, `vp test`, `vp lint`
  and `vp fmt`.
- Shell environment variables stay with direnv ([the direnv decision](0011-use-direnv.md)): Vite+
  does not load a shell environment. mise is a fallback for tools Vite+ does not provide; none is
  needed today.
- `test/package-manager-invariants.test.ts` (where present) checks that there is no `mise.toml`
  or `devEngines` and that `engines.node` and `packageManager` are exact versions.

## Consequences

A developer needs the Vite+ global CLI with `vp env` in managed mode. Running a different Node.js
or pnpm (for example from mise or a system package) is no longer the documented path; pnpm still
stops with `ERR_PNPM_BAD_PM_VERSION` when its version differs from `packageManager`.
