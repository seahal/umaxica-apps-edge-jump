# Implementations

Jump is a protocol with more than one implementation. The Hono implementation in
this repository is the reference: production runs only Hono, and every other
implementation follows it. See
[ADR 0004](../adr/0004-multiple-jump-implementations.md).

## The Interface

The contract every implementation must reproduce is what a client, issuer, or
receiver can observe. Each item is specified in the linked document; this page
does not restate it.

- `GET /?rt=<JWT>` as the only redirect entry point —
  [Architecture](architecture.md)
- JWT claim schema `schema: 1`, ES384 / P-384, issuer registry and destination
  policy — [Security](security.md), [Compatibility](compatibility.md)
- Internal destinations receive `302`; external destinations always receive a
  cushion page first — [Decisions](decisions.md)
- Public error classes and their statuses, including `400` versus `503` for
  JWKS outages — [Decisions](decisions.md), [Security](security.md)
- `/.well-known/jwks.json` publishing Jump's own signing keys and
  `/health.json` — [Security](security.md),
  [Key Rotation](operations/key-rotation.md)
- Security headers, no cookies, and no logging of the full `rt` —
  [Security](security.md), [Logging](logging.md)

## Implementations

| Implementation                                                | Host                                   | Environment                       | Role                                     |
| ------------------------------------------------------------- | -------------------------------------- | --------------------------------- | ---------------------------------------- |
| Hono on Cloudflare Workers (this repository)                  | `jump.umaxica.net`                     | production                        | Reference; the only production path      |
| Hono on Fastly Compute (this repository)                      | —                                      | experimental                      | Non-production, unverified               |
| Hono local runtimes (`cloudflare:dev` / `fastly:serve`)       | `127.0.0.1:5209` / `127.0.0.1:7676`    | development of this repository    | Reference, run locally                   |
| Rails-embedded implementation, modelled on the Cloudflare one | `leap.umaxica.net` (Cloudflare Tunnel) | Rails `development` / `test` only | Non-production compatible implementation |

## Selecting An Implementation

Issuer and receiver applications choose the Jump base URL through environment
configuration:

| Application environment | Jump base URL              |
| ----------------------- | -------------------------- |
| production              | `https://jump.umaxica.net` |
| development / test      | `https://leap.umaxica.net` |

Receivers fetch Jump's keyset from `<base>/.well-known/jwks.json`, so switching
the base URL switches the trusted keyset with it. Development and production
tokens are never mutually verifiable.

The variable name and the Rails-side structure of the development
implementation are defined by the Rails application, not here.

## Rules For Non-Production Implementations

- Never run, or be reachable, as part of a production deployment.
- Never hold or share the production signing key or its `kid`.
- Never be referenced by production: no production registry entry, receiver,
  or allowlist names `leap.umaxica.net` or its JWKS.
- When behavior differs from Hono, Hono is correct.
