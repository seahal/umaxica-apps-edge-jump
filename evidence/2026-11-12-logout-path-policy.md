# Logout path policy retirement

Removed the production `/sign/out` deny rules at the owner's request ahead of
a logout redesign. No route-specific deny rules remain configured. General URL
syntax validation, query controls and issuer allowlists remain in force.
Source-to-self rejection remains in registry construction and runtime policy,
including when an injected allowlist mistakenly contains its own issuer origin.
No approved edges or cross-TLD rules were changed.

Updated signed graph tests to require acceptance of former logout routes and
format variants, while retaining rejection of ambiguous path syntax. Existing
self-loop tests cover both registry and runtime enforcement.
See ADR 0008 for the owner's decision.

Checks via `mise exec pnpm@12.0.0 -- pnpm run <script>`:

- `format`: passed.
- `lint:check`: passed without warnings.
- `typecheck`: passed.
- `git diff --check`: passed.
- `test`: 21 files, 2216 tests passed in 53.32 seconds.
