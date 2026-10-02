# Implemented runtime

Cloudflare Workers production with Hono is the sole supported implementation.
The shared core has explicit Web Standard dependencies and can be adapted later.
No additional provider, environment authority, local validation bypass, Rails
implementation or emulator service is implemented here.

Test-only fixtures are explicitly injected from test/fixtures and cannot be
selected implicitly by production. Node adapter invocation, local browser tests
and workerd tests are distinct verification levels. They all retain production
HTTPS destination and cryptographic checks.

Earlier Leap/Rails and Fastly statements in ADR0004 and historical evidence are
superseded by [ADR0005](../adr/0005-production-jump-0.2.md), not erased history.
