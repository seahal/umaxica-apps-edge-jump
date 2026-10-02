# Compatibility and recovery gate

Service 0.2.0 retains JWT schema 1, JWT typ and ES384/P-384. Requiring exact
string `rpl: "reuse"` is an approved intentional acceptance tightening. Missing,
null, once, case variants and other types are rejected. 13 issuers/20 edges replace
the earlier Auth/Base-only registry, old Palm and Edit destinations.

| Issuer packet                      | Jump                      | Receiver     | Outcome / gate                                                                         |
| ---------------------------------- | ------------------------- | ------------ | -------------------------------------------------------------------------------------- |
| New issuer                         | New 0.2                   | New receiver | Locally signed fixtures pass; real receivers unverified                                |
| Old packet missing rpl             | New 0.2                   | Any          | Intentional 400 invalid_request                                                        |
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

## Additional 0.2 hardening contract

See [explicit recovery artifact conditions](operations/rollback-recovery.md). rollback-compatible immutable artifact: NOT YET VERIFIED. Identity migration requires issuer/receiver coordination; [origin cutover](operations/origin-cutover.md) describes future migration windows without implementing multi-origin trust.
