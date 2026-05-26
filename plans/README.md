# Plans

This directory contains pending implementation plans.

## Workflow

1. A plan file is created here when a feature or refactor is scoped.
2. A corresponding GitHub issue is opened, referencing the plan file.
3. When implementation is complete and merged, the plan file is **moved to `/adr/`** and a `## Outcome` section is appended documenting what was done.

## Active Plans

| Plan                                      | Issue | Title                                              |
| ----------------------------------------- | ----- | -------------------------------------------------- |
| [004](./004-get-route-status-coverage.md) | TBD   | Happy-path status code coverage for all GET routes |

## Completed Plans (moved to /adr)

| Plan                                         | Issue                                                          | Title                                              |
| -------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------- |
| [001](../adr/001-rails-health-check.md)      | [#247](https://github.com/seahal/umaxica-apps-jump/issues/247) | Rails backend health check integration             |
| [002](../adr/002-dev-apex-vercel.md)         | [#248](https://github.com/seahal/umaxica-apps-jump/issues/248) | Create `dev/apex` — Hono on Vercel                 |
| [003](../adr/003-apex-direct-composition.md) | [#249](https://github.com/seahal/umaxica-apps-jump/issues/249) | Migrate apex workspaces to direct Hono composition |
