# ADR 0003: Prohibit Self-Referential Redirects

## Status

Accepted

## Context

Jump brokers redirects between a fixed set of FQDNs. The production registry
(`src/config/registry.umaxica.ts`) names 14 application FQDNs across
`umaxica.app` / `umaxica.com` / `umaxica.org`, plus the broker itself
(`jump.umaxica.net`) as the 15th. Every hop is `source -> jump -> destination`,
so the broker is the edge of the graph rather than one of its nodes.

A redirect whose destination equals its source adds nothing: the user ends up
where they already were, having spent a signature verification and a round trip
through the broker. It is, however, actively dangerous.

A self-referential hop is the primitive a redirect loop is built from. An
application that reacts to arriving at itself by minting another Jump token —
a login bounce, a locale bounce, a "restore intent" bounce — will do so again on
arrival, and the browser will follow the chain until it hits its own redirect
limit. The loop terminates in a browser error rather than a service alarm, so
the first signal is a user report, not a monitor. Worse, each iteration is a
fully valid, correctly signed Jump request, so nothing in the verification path
distinguishes the loop from legitimate traffic. The tokens are valid until
`exp`, so a loop that starts is not self-limiting within its window.

The same argument applies to a destination that is the broker itself. A token
whose `url` points back at `jump.umaxica.net` nests one Jump request inside
another, which turns Jump into an amplifier for the same loop and makes the
audit trail ambiguous about which hop a log line describes.

## Decision

A Jump destination must never be the same origin as the request's source, and
must never be Jump itself.

Specifically:

- No issuer in the registry lists its own origin in `allowed_dst_internal`.
  Self-loops are not a policy check applied to a configured route; the route is
  never configured in the first place.
- A destination equal to the service origin is rejected as `invalid_url` by
  `normalizeUrl` in `src/core/normalize_url.ts`, independently of any registry
  content.
- Adding a self-referential route is not something a registry edit can do by
  accident: the registry is generated from a role matrix, and the test suite
  pins both the shape and the behavior (see Consequences).

This is narrower than loop prevention in general. Jump is stateless and sees one
hop at a time, so it cannot detect a longer cycle such as
`base -> core -> base`. The prohibition here is on the one-hop case, which Jump
can see and therefore must refuse. Preventing longer cycles remains the
responsibility of the applications that mint tokens.

## Consequences

- `A -> A` is impossible for all 15 FQDNs. The 14 application FQDNs are refused
  with `invalid_dst` when the source is a known issuer and `invalid_claim` when
  it is not; `jump.umaxica.net` is refused with `invalid_url`.
- An application that needs to send a user back to a URL on its own origin does
  it locally. It must not route that navigation through Jump.
- `test/jump.test.ts` holds three layers of enforcement: a structural assertion
  that no issuer lists itself, a behavioral assertion that each of the 15 FQDNs
  is refused a jump back to itself, and an exhaustive matrix over all 196
  ordered pairs of the 14 application FQDNs that accepts exactly the 14
  configured edges. Widening the role matrix to include a self-loop fails these
  tests.
- If a future requirement genuinely needs a same-origin hop through Jump, it
  requires a new ADR and an explicit loop-budget design, not a registry edit.
