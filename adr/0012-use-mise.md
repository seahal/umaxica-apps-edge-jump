# Use mise for runtime versions

> **Superseded 2026-11-17** by [0013-use-vite-plus-for-node-and-pnpm](0013-use-vite-plus-for-node-and-pnpm.md): Vite+ now installs Node.js and pnpm; this repository has no `mise.toml`.

Date: 2026-11-16
Status: accepted by the owner

## Context

Development runs directly on the developer's machine, without a development container.
Runtime versions (for example Ruby, Node.js, pnpm, Bun) must still match between developers,
CI, and production. Relying on whatever the operating system or a global installer provides
lets versions drift between machines and repositories.

## Decision

- This repository uses [mise](https://mise.jdx.dev/) to install and select runtime and tool
  versions.
- The versions are pinned in `mise.toml` at the repository root and committed.
- A developer runs `mise install` after cloning and after each change to `mise.toml`.
- mise handles runtimes and tools only. Environment variables stay with direnv, as decided
  in the direnv ADR.
- mise is the only installer of Node.js and pnpm on a developer machine; `package.json` has no
  `devEngines` (owner decision 2026-11-17).
- `package.json` keeps `packageManager` because CI installs pnpm from it, and `engines.node`
  for the Node.js version CI selects. Both match `mise.toml`. CI does not use mise.

## Consequences

Developers must install mise and activate it in their shell. Each repository can use its own
runtime versions without affecting other repositories. A version upgrade is a reviewed change
to `mise.toml`, and every place that also declares the version must change with it.
