# Accept rate limiter call failures as an availability tradeoff

Date: 2026-11-12
Status: accepted by the owner

## Decision

Keep the current Cloudflare Workers Rate Limiting binding behavior: when a
verified binding's `limit()` call throws, log `jump_rate_limit_skipped` with
`reason=limiter_call_exception` and continue processing the request.
The owner explicitly accepts the resulting risk that rate limiting is unavailable
for those requests during a provider/binding failure.

A normal limit-exceeded result still returns 429. Missing/invalid bindings,
missing/invalid client IP, malformed limiter results and expired request deadlines
continue to fail closed. JWT signature, claims and destination policy checks
remain mandatory after a skipped rate-limit check.

## Consequences

A limiter call failure can expose the service to higher request load and resource
consumption. This does not authorize invalid tokens or unapproved destinations.
It does not establish that Cloudflare is currently malfunctioning or that every
exception is provider-caused. No fallback limiter is introduced.

Workers execution limits and PaaS outages can also prevent normal operation;
accepting a limiter call failure does not bypass those platform constraints or
guarantee availability. Use the [PaaS playbook](../docs/playbook/paas-availability.md)
for investigation. No runtime behavior changes accompany this decision.
