# ADR 0005: Production Jump 0.2 security contract

Status: accepted project contract (2026-10-02); production rollout blocked pending
external acceptance. Supersedes current Fastly/Leap/environment contracts in
ADR0004 and static-assets prohibition in ADR0001. Historical text is preserved.

## Decision

Cloudflare Workers production is the sole runtime. Portable Web Standard core
retains explicit dependency injection; no speculative adapters or emulator are
added. Remove Fastly code/config/dependencies and implicit example selection.

Use explicit13 canonical nodes and20 directed edges, origins for JWT iss/aud/src,
exact JWKS paths, runtime self/Jump denial and all-external-disabled production.
Schema1 requires rpl reuse, deliberately tightening0.1 acceptance; service0.2.0
and protocol schema are different version axes. Reevaluate every request and mint
new jti without replay state or source-jti transfer.

Required configurable identity flows through request binding, inbound aud,
outbound iss, public canonical URLs and deep URL checks. No fallback identity.
Explicit active private/kid/public集合 imports nonextractable private material,
probe checks pair and publishes only validated public keys, including active.
No private-to-public runtime fallback and no legacy binding aliases.

Outer adapter deadline/errors/headers cover all stages. Only a verified limiter
call exception may fail open; missing binding/IP and invalid result shape fail503.
Common no-store/no-referrer/no-cookie/HSTS/CSP and HEAD apply to every response.
Receiver owns authn/authz/CSRF/transactions/downstream redirects independently.

## Consequences

New strictness and graph require coordinated external acceptance. Safe recovery
must emit reuse and preserve security fixes, revocations and banned edges; the
unmodified previous release is not a qualified rollback target. Explicit key
prepublication/activation/retirement preserves verification overlap. Published
future keys already confer verification trust. No deployment or production key
rotation is part of this local change. Tests and release permission are separate.

## Additional 0.2 hardening contract

No readiness endpoint is exposed (an earlier `/ready` was removed on 2026-10-02). Liveness is /health*; signing material is checked through /.well-known/jwks.json, which publishes only the pair-checked bundle; the redirect path is checked with a valid signed RT smoke. Rate limiting is the Cloudflare native binding only. The existing Miniflare/workerd harness is a mandatory CI runtime job, distinct from unit validation. Recovery requires a verified immutable compatible artifact; current artifact status is NOT YET VERIFIED.
