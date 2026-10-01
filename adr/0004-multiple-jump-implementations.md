# ADR 0004: Jump Is One Protocol With Multiple Implementations

## Status

Accepted

## Context

Until now a single Hono deployment on `jump.umaxica.net` served every
environment: production, development, and test. That has reached its limit.

Issuer and receiver applications are Rails applications. Developing them
locally means minting `rt` tokens that a Jump server must verify, and the
production broker cannot verify them: its registry trusts only production
issuer origins and their production JWKS, and it must stay that way. Without a
reachable Jump, local Rails development and Rails test runs cannot exercise a
cross-FQDN redirect end to end.

A development Jump therefore has to exist outside this repository's production
deployment. It is reached through a Cloudflare Tunnel, and the tunnel cannot
use `jump.umaxica.net` because that hostname is the production custom domain.

The result is that more than one program now speaks the Jump interface. That
fact has to be stated explicitly, together with which program is authoritative,
or the implementations will drift without anyone deciding that they should.

## Decision

Jump is a protocol — the externally observable contract described in
[Implementations](../docs/implementations.md) — and it may have more than one
implementation.

**The Hono implementation in this repository is the reference
implementation.** Jump is production first: when two implementations disagree,
the Hono behavior is correct and the other implementation is fixed. New
behavior lands in Hono first and is mirrored elsewhere afterwards.

| Implementation                                                | Host                                   | Environment                       | Role                                     |
| ------------------------------------------------------------- | -------------------------------------- | --------------------------------- | ---------------------------------------- |
| Hono on Cloudflare Workers (this repository)                  | `jump.umaxica.net`                     | production                        | Reference; the only production path      |
| Hono on Fastly Compute (this repository)                      | —                                      | experimental                      | Non-production, unverified               |
| Hono local runtimes (`cloudflare:dev` / `fastly:serve`)       | `127.0.0.1:5209` / `127.0.0.1:7676`    | development of this repository    | Reference, run locally                   |
| Rails-embedded implementation, modelled on the Cloudflare one | `leap.umaxica.net` (Cloudflare Tunnel) | Rails `development` / `test` only | Non-production compatible implementation |

Issuer and receiver applications select the Jump base URL through environment
configuration. In production that value is always `https://jump.umaxica.net`.
How the Rails implementation is organized internally, and the name of the
variable that carries the base URL, belong to the Rails application and are
deliberately not part of this contract.

A non-production implementation:

- must not run, or be reachable, as part of a production deployment;
- must not hold or share the production signing key or its `kid`;
- must not be trusted by production: no production registry entry, receiver, or
  allowlist refers to `leap.umaxica.net` or its JWKS.

## Consequences

- There are now several interfaces in practice, and drift between them is a
  real risk. Compatibility is measured against this repository's docs and test
  suite, not against whatever the Rails implementation currently does.
- Switching the Jump base URL also switches where receivers fetch Jump's JWKS,
  because the keyset is published at `<base>/.well-known/jwks.json`. A
  development token is therefore never verifiable by production, and the
  reverse.
- This repository's code does not change. The production registry already
  trusts no development origin, so the prohibitions above are enforced by
  configuration and review rather than by a new guard in the Worker.
- `leap.umaxica.net` and the Rails implementation are outside this
  repository's security scope; see `SECURITY.md`.
- Promoting a non-Hono implementation to production, or adding another
  production implementation, requires a new ADR.
