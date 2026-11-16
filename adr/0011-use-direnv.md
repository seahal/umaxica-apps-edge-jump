# Use direnv for the development environment

Date: 2026-11-16
Status: accepted by the owner

## Context

Each repository needs per-project environment variables (tool versions, local service URLs,
credentials for development) when a developer works in it. Exporting these by hand or from a
shell profile leaks values between repositories and makes the setup differ between machines.

## Decision

- This repository uses [direnv](https://direnv.net/) to load its development environment.
- The environment is defined in `.envrc` at the repository root. direnv loads it on entering the
  directory and unloads it on leaving.
- A developer runs `direnv allow` once after cloning and again after each reviewed change to
  `.envrc`.
- Secrets and machine-specific values stay out of version control. They live in git-ignored
  files that `.envrc` loads, not in `.envrc` itself.

## Consequences

Developers must install direnv and hook it into their shell. Environment variables are scoped to
the repository, so values do not carry over between repositories. Changes to `.envrc` require a
fresh `direnv allow`, which keeps unreviewed code from running automatically.
