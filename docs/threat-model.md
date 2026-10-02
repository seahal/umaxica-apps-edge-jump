# Threat model and residual risks

Assets: issuer authority, destination policy, signing private PEM, public trust
and token/query confidentiality in logging. Attackers control RT/query/path,
claim/header types, arbitrary request headers and destination strings. They cannot
register origins, choose JWKS endpoints from token hints or turn errors into redirects.

Exact graph and issuer-specific keys resist authority confusion, cross-TLD,
old-host aliases, RP/Auth direct hops and prototype names. Issuer-owned private
keys remain trust anchors: compromise allows instructions within that issuer's
approved edges until explicit revocation. Destination endpoints and downstream
redirects still need [receiver checks](receiver-contract.md).

Stateless reuse deliberately permits evaluation until expiry. It is not global
replay prevention, idempotency or permission for double execution. Revocation
checks precede cache; JWKS removal alone cannot invalidate cached public trust.
Emergency deployment and coordinated receiver revocation are needed.

The limiter uses provider-confirmed CF-Connecting-IP for coarse abuse control,
600/60s namespace520900. It is neither user authentication nor a strict global
counter. Shared IPs suffer collateral denials. Verified binding call exceptions
fail open with a fixed warning; whether the fault is transient is unknown. All
crypto/policy checks still apply. Residual availability/load risk and upstream
JWKS load increase during such exceptions. Binding/IP/result mistakes fail503.

The one-second whole-entry budget may reject cold or slow legitimate flows.
Cancellation observes losing rejections and cancels streamed JWKS reads; crypto
work itself may finish after cancellation, but cannot return/log success.
Isolate cache eviction increases dependency load without granting trust.

Application tests do not validate Cloudflare zone transformations, Access/WAF,
TLS/routes, platform log persistence or deployed secret references. These remain
production gates. Current dependency-audit concerns in earlier evidence remain
separate; no wholesale dependency upgrades are included in this change.

## Additional 0.2 hardening contract

Readiness exposes only ready/unavailable, never signatures or secret/config detail. Fixed internal probe signing cannot mint navigation tokens. Successful material is cached; failures remain retryable and repeated broken-config probes are a residual availability risk. Emergency key removal alone cannot revoke receiver caches; receiver revocation must lead or accompany replacement. Arbitrary earlier Worker versions and identity-only rollback can break ongoing issuance.
