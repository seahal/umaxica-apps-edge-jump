# auth routing restricted to base (app/com/org)

## What was done

`src/config/registry.umaxica.ts` was rewritten as a role matrix expanded over
`app` / `com` / `org`, so the three TLDs are identical by construction except
where a role does not exist on a TLD:

- roles: `auth` = `auth.*`, `base` = `www.*`, `side` = `www-jp.*`,
  `core` = `jp.*` (all three TLDs), `edit` = `edit.umaxica.org` (org only),
  `palm` = `palm.umaxica.app` (app only)
- issuers: `auth` and `base` only
- `auth.umaxica.<tld>` -> `www.umaxica.<tld>` only
- `www.umaxica.<tld>` -> `auth`, `side`, `core`, and the TLD-specific `edit` /
  `palm`

`auth` <-> `side` / `core` / `edit` / `palm` therefore has no allowlist entry in
either direction, and `assertDestinationPolicy` (`src/core/policy.ts`) rejects
such a token as `invalid_dst`. `docs/operations/production-configuration.md`
was updated to the same table.

## Verification

- `pnpm run format`, `pnpm run lint:check`, `pnpm run typecheck` — clean.
- `pnpm run test` — 3 files, 170 tests passed, including
  `umaxica registry forbids auth <-> non-base routing on every tld`, which
  asserts each `auth.*` issuer allows exactly its same-TLD `www.*`, that
  `www-jp.*` / `jp.*` / `edit.*` / `palm.*` are not issuers, and that no
  destination crosses a TLD.
- `umaxica registry rejects cross-tld hops at runtime` (new) drives `handleJump`
  with the real production registry: a token claiming
  `iss=https://edit.umaxica.org` with `url=https://palm.umaxica.app/path` is
  rejected with `X-Jump-Error: invalid_claim` (edit is not an issuer), and
  `www.umaxica.org -> palm.umaxica.app`, `www.umaxica.app -> edit.umaxica.org`,
  `www.umaxica.org -> www-jp.umaxica.com`, `auth.umaxica.app ->
www.umaxica.org` are each rejected with `invalid_dst`.
- `umaxica registry accepts exactly the 14 allowed edges of the 196 ordered
pairs` (new) enumerates the 14 FQDNs the registry mentions (6 issuers + 8
  destination-only hosts) and drives `handleJump` once per ordered pair,
  self-pairs included. It asserts exactly the 14 registry edges return 302 with
  a `Location` on the claimed destination origin, and that each of the other 182
  returns `invalid_dst` when the `iss` is a known issuer and `invalid_claim`
  when it is not. The FQDN count (14) and edge count (14) are pinned, so adding
  a route requires deliberately updating them.
- `umaxica registry never allows a self loop` (new) states the self-loop ban
  directly rather than leaving it implicit in the 196-pair matrix: structurally,
  no issuer lists its own origin as a destination; behaviourally, each of the 14
  hosts is refused a jump back to itself (`invalid_dst` for the 6 issuers,
  `invalid_claim` for the 8 destination-only hosts). Mutation check: adding
  `base` to its own destination list fails it
  (`expected [...] to not include 'https://www.umaxica.app'`); the registry was
  restored and the suite re-run green.
- The self-loop test also covers the 15th FQDN, the broker: each of the 6
  issuers is refused a destination of `https://jump.umaxica.net/?rt=nested` with
  `invalid_url` (rejected by `normalizeUrl`, independently of the registry).
- Documented: `adr/0003-no-self-referential-redirects.md` (new),
  `docs/security.md` (Self-Referential Redirects), `docs/decisions.md`,
  `docs/glossary.md`.
- Mutation check: temporarily widening the matrix to `auth -> [base, core]`
  fails the test (`expected 17 to be 14`); the registry file was restored and
  the suite re-run green.
- Generated registry inspected directly (`pnpm exec tsx -e ...`); it matches the
  table above.
