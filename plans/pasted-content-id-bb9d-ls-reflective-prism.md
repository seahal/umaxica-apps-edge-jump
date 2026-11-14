# Add an EDGE Family section to the jump README

## Context

The edge repo's README now has an "EDGE Family" section that links the sibling repos.
jump should link back so a reader can find the other repos from here too.

## Change (README.md only)

Add a short section right after `## Purpose` and before `## NON-GOALS`. Mark jump as this repo, and list edge first because it is the parent:

```md
## EDGE Family

Jump was split out of the Umaxica edge monorepo. Sibling repositories:

- [umaxica-apps-edge](https://github.com/seahal/umaxica-apps-edge) — the edge
  monorepo the family was split from.
- **umaxica-apps-jump** (this repository) — controls the Umaxica TLD apex and
  prevents open redirects on its own.
- [umaxica-apps-edge-core](https://github.com/seahal/umaxica-apps-edge-core) —
  reserved for the TanStack Start system once it outgrows edge; not split out
  yet.
- [umaxica-apps-edge-away](https://github.com/seahal/umaxica-apps-edge-away) —
  planned standalone cushion pages for external destinations; no core yet.
```

Notes:

- The comments for jump, core and away match the ones in the edge README, so both lists say the same thing.
- The away line fits the uncommitted ADR 0007 (remove external destinations): the cushion page moves out of jump. The README intro still says external destinations get a cushion page. That wording belongs to ADR 0007's work, so it is left alone here.
- README.md already has uncommitted edits. Add the section on top of them and don't touch anything else.

## Verification

- `pnpm exec oxfmt --check README.md`
- `pnpm run lint`, plus the spelling check if the repo has one (cspell: TanStack)
- `pnpm run test` (README or link tests, if any)
