# Liveness, readiness and incident monitoring

`/health`, `/health.json` and `/health.html` retain their existing liveness meaning:
the Worker can respond. A 200 does not guarantee safe RT issuance.

GET /ready and HEAD /ready check valid configured origin, exact request origin,
required private key, active kid, configured public JWKS, active public key
membership, successful cryptographic pair check, and a structurally present
callable limiter binding. Key loading validates all configured public keys and
imports the private key non-extractably. GET returns exactly:

| Condition   | HTTP | Content-Type     | Body                       |
| ----------- | ---- | ---------------- | -------------------------- |
| ready       | 200  | application/json | `{"status":"ready"}`       |
| unavailable | 503  | application/json | `{"status":"unavailable"}` |

HEAD uses the same status/headers and no body. All responses keep no-store,
no Set-Cookie, X-Robots-Tag and existing security headers. Configuration errors,
origin mismatch and deadlines on readiness use the unavailable response without
kid, binding names, issuer, JWKS, key mismatch details or exception text. Normal
method/invalid rt entry validation still applies before readiness.

Readiness does not fetch Rails issuer JWKS, contact receivers/external sites,
issue navigation RTs, or access DB/KV/Durable Objects/replay state. The internal
pair-check signature is a fixed probe without destination/audience and is never
returned. A ready result proves local configuration, not external reachability.

Readiness reuses CloudflareKeyMaterialCache (env identity, revision and kid;
300-second successful bundle TTL and shared in-flight loading). Warm successful
checks do not import private material again. Failed loads are evicted and can
retry for recovery; repeated probes of broken configuration can consume crypto or
secret-backend work. Use a bounded operational probe frequency and investigate
configuration failures promptly. This change adds no new telemetry or cache store.

Limiter presence is structural: readiness never calls limit(), consumes quota or
requires CF-Connecting-IP. Navigation still rejects absent/invalid CF-Connecting-IP.
A provider exception from an otherwise valid limiter call remains the approved
limited fail-open, logs a warning and proceeds with normal authorization checks;
it does not permanently make readiness unavailable. Malformed results and missing
bindings still fail closed.

## Monitoring contract

One occurrence may require investigation for invalid_service_origin,
request_origin_mismatch, limiter_binding_missing, missing_active_kid,
jump_secret_binding_unavailable, jump_public_jwks_invalid, or
jump_signer_unavailable (missing_private_key, missing_public_jwks,
kid_not_in_public_jwks, key_import_failed, key_pair_mismatch). Pair-check failure
is also reported by jump_signer_pair_check_failed. These indicate configuration
or deployment incidents. Signer success/configuration events are diagnostics,
not alerts. Probe outcomes are not high-cardinality metrics.

invalid_signature, invalid_dst, malformed and invalid_claim can reflect attacks,
stale clients or misuse: use rate-based monitoring. limiter_call_exception also
warrants rate-based provider/load investigation. Logs must never include full rt,
JWT, private key, JWKS body, arbitrary destination URL or raw exception text.
No Cloudflare alert resources are created; operators must separately verify their
alert routing. See [recovery](rollback-recovery.md) and [production gates](production-configuration.md).
