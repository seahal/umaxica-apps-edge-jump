# Contributing

I admire the passion of those who strive to create codes. This product would not have been possible without their encouragement.

## Workflow

Follow [AGENTS.md](AGENTS.md): pnpm only, and run these before handing off a change:

```sh
pnpm install --frozen-lockfile
pnpm run format:check
pnpm run lint:check
pnpm run typecheck
pnpm run test
```

Record completed verification in `evidence/` as described in AGENTS.md.
Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md),
never in a public issue or pull request.
