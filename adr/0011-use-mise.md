# Use mise for runtime versions

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
- When a version is also declared elsewhere (for example `package.json`, `.ruby-version`, or
  CI configuration), it is kept the same as the version in `mise.toml`.

## Consequences

Developers must install mise and activate it in their shell. Each repository can use its own
runtime versions without affecting other repositories. A version upgrade is a reviewed change
to `mise.toml`, and every place that also declares the version must change with it.
