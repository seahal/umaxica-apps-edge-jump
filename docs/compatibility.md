# Compatibility and recovery gate

Service 0.3.0 retains JWT schema 1, JWT typ and ES384/P-384. Requiring exact
string `rpl: "reuse"` was introduced by 0.2 as an approved intentional acceptance tightening. Missing,
null, once, case variants and other types are rejected. 13 issuers/20 edges replace
the earlier Auth/Base-only registry, old Palm and Edit destinations.

| Issuer packet                      | Jump                      | Receiver     | Outcome / gate                                                                         |
| ---------------------------------- | ------------------------- | ------------ | -------------------------------------------------------------------------------------- |
| New issuer                         | New 0.3                   | New receiver | Pre-deployment acceptance USER_REPORTED complete; specific Rails URL/TTL gaps remain   |
| Old packet missing rpl             | New 0.3                   | Any          | Intentional 400 invalid_request                                                        |
| New issuer                         | Planned recovery artifact | New receiver | BLOCKED: artifact must pass rpl, graph, revocation and security tests                  |
| Base/Auth six existing round trips | Recovery artifact         | New receiver | Must independently pass all six signed round trips                                     |
| New-only issuer/edge               | Earlier graph             | New receiver | Ongoing issuance stays rejected; explicitly stop issuance or use tested recovery graph |

The previous 0.1 Worker omits outbound rpl. After receiver tightening, rolling
back to it causes newly issued packets to fail continuously; waiting in-flight
TTL cannot fix this. A rollback target must preserve required security fixes,
reuse output, banned edges and all current revocations. None has been verified
here: **BLOCKED_FOR_ROLLOUT**. Prepare a compatible recovery release or coordinate
issuer/receiver cutover. Never restore compromised trust to regain availability.

Use actual Worker version IDs and secret/config references. Git SHA, service
version and deployed Worker version are different identifiers. Production owner
must verify canonical bindings, 13 live issuer JWKS endpoints, real receiver
contracts, routes/DNS/TLS/Access/WAF, headers and platform logging before release.
Tests with fixture JWKS or browser-only receivers are not Rails E2E.

## Current recovery and integration gates

The user reports pre-deployment acceptance complete; this is accepted as a
`USER_REPORTED` premise, not repeated by this follow-up. The tested revision and
case inventory have not been linked here. Keep that report separate from the
specific source-level Rails URL/TTL gaps below, deployed binding verification,
and a tested immutable rollback artifact. The
[current plan](../plans/jump-0.3-hardening.md) pins baseline CI evidence to its SHA.

See [explicit recovery artifact conditions](operations/rollback-recovery.md). rollback-compatible immutable artifact: NOT YET VERIFIED. Identity migration requires issuer/receiver coordination; [origin cutover](operations/origin-cutover.md) describes future migration windows without implementing multi-origin trust.

## Coordinated blockers (not changeable from Jump alone)

- **Explicit typing.** `typ: JWT` is not effective explicit typing under the JWT
  BCP (RFC 8725 §3.11, draft-ietf-oauth-rfc8725bis-10). Schema 1 fixes
  `typ: JWT` inbound and outbound and receivers verify it, so a Jump-only change
  breaks interoperability. A dedicated media type needs a schema migration
  coordinated across issuers, Jump and Rails receivers. Until then the profile
  is separated by the mutually exclusive `sub`/`schema`/`rpl`/`dst`/`url` rules.
- **URL parser differential.** Jump compares with WHATWG URL/URLSearchParams;
  the Rails receiver reportedly uses Rack nested-query semantics. Jump cannot
  declare this safe on its own and does not blanket-reject characters such as
  `;` that are legal in OAuth `state`. The cases below must be run in the Rails
  runtime against Jump-produced URLs before any change on either side.

| Case                 | Input to compare in both parsers                                      |
| -------------------- | --------------------------------------------------------------------- |
| Semicolon            | `?a=1;b=2`, `?state=x;y`, `?rt=<jwt>;rt=<jwt>`                        |
| Duplicate parameters | `?state=a&state=b`, `?rt=<jwt>&rt=<jwt>` (first/last/array)           |
| `rt` forms           | `rt`, `rt[]`, `rt[x]`, `rt[][x]`, `rt%5B%5D`, `RT`                    |
| Nested query         | `a[b]=1&a[c]=2`, `a[]=1&a[]=2`, `a[b][c]=1`, conflicting `a=1&a[b]=2` |
| Space                | `%20` vs `+` in keys and values                                       |
| Literal plus         | `%2B` in keys and values                                              |
| Encoded key          | `%72t=<jwt>`, `r%74=<jwt>`, `stat%65=x`                               |
| Slash and backslash  | `%2F`, `%5C`, raw `\` in path and query                               |
| Ordering             | `a=1&b=2` vs `b=2&a=1`, position of `rt` (first, middle, last)        |

## Schema-1 acceptance tightening in 0.3

Inbound structural `exp - iat` must be at most 30 seconds, reduced from 300.
The five-second clock tolerance is not added to the structural TTL. Fractional
NumericDates retain their existing jose contract; expired/nbf boundaries remain.
Outbound structural TTL stays 30 seconds. Canonical Rails issuers reportedly
already cap issuance at 30 seconds; actual production issuance is not verified
here. No issuer requiring 300 seconds has been established.

The reported Rails receiver uses Rack nested-query Hash semantics rather than
normative WHATWG URL/URLSearchParams comparison. Duplicate/reserved keys, order
and percent serialization require receiver-owned regression tests. This is
`EXTERNAL_BLOCKER`, not repaired or proven by Hono fixtures. Receiver maximum TTL
must accept Jump's 30-second output; a configured 10-second limit is incompatible.

`GITHUB_RELEASE_GATE = BLOCKED_UNTIL_ENFORCED`.
`ROLLBACK_ARTIFACT = NOT_VERIFIED`.
`ROLLOUT_STATUS = BLOCKED_FOR_ROLLOUT`.
Production bindings/traffic, the specific Rails contract gaps and immutable
recovery remain external gates. See [release closure](operations/release-closure.md).
