# Deployment verification and incident monitoring

Jump has no readiness endpoint. Verify a deployment in three layers, each with
its own meaning:

| Layer            | Check                                    | Meaning                                                                                       |
| ---------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| Liveness         | `GET /health.json` → 200, `status: "OK"` | The Worker and Hono app respond. Says nothing about signing keys.                             |
| Signing material | `GET /.well-known/jwks.json` → 200       | The private key, active kid and public JWKS loaded, and the private/public pair check passed. |
| Redirect path    | Valid signed RT smoke                    | The real verification, policy and signing path works end to end.                              |

## Recommended checks after a deployment

1. `GET /health.json` returns 200. A broken signing configuration does not
   change this response.
2. `GET /.well-known/jwks.json` returns 200 with the expected kids and no
   private fields. A missing private key, missing kid, kid absent from the
   public JWKS, invalid JWKS or key-pair mismatch returns 503
   `service_unavailable` without detail. The route publishes only a keyset that
   passed the pair check in `loadKeyMaterial` (`src/cloudflare.ts`).
3. A valid signed RT for an approved edge returns 302. The outbound `rt` has
   the active kid and verifies against the published JWKS.
4. A signed RT for a forbidden edge returns 400 `invalid_request` with no
   `Location`.

None of these checks fetches receivers or proves receiver acceptance. All of
them pass through the rate limiter (below). Probe at a bounded frequency.

Successful signing material is cached per binding bundle, deployment revision
and active kid for 300 seconds. A failed load is not cached; the next request
retries it.

## Rate limiting

The only rate-limit mechanism is the Cloudflare Workers native Rate Limiting
binding `JUMP_RATE_LIMITER`. `wrangler.jsonc` `ratelimits` is the source of
truth: namespace 520900, 600 requests per 60 seconds. `src/cloudflare.ts` calls
`limit({ key })` with `CF-Connecting-IP` before any route, including `/health*`,
`/.well-known/jwks.json` and static assets. No KV, Durable Object, D1, Cache API,
in-memory counter or third-party limiter is used.

It is coarse abuse control only. It is not authentication, authorization,
replay protection or accounting, and no security decision depends on it. Users
behind a shared NAT, mobile carrier gateway or privacy proxy share one key and
can be limited together. A monitor that receives 429 hit the limit; it does not
mean the Worker is down.

Failure semantics:

- Missing or noncallable binding, absent or invalid `CF-Connecting-IP`, or a malformed result → 503 `service_unavailable`.
- `success: false` → 429 `rate_limited`.
- An exception from an otherwise valid binding call logs `limiter_call_exception` and continues. Every JWT, URL, graph and key check still applies.

## Monitoring contract

One occurrence may require investigation for invalid_service_origin,
request_origin_mismatch, limiter_binding_missing, missing_active_kid,
jump_secret_binding_unavailable, jump_public_jwks_invalid, or
jump_signer_unavailable (missing_private_key, missing_public_jwks,
kid_not_in_public_jwks, key_import_failed, key_pair_mismatch). Pair-check failure
is also reported by jump_signer_pair_check_failed. These indicate configuration
or deployment incidents. Signer success/configuration events are diagnostics,
not alerts.

invalid_signature, invalid_dst, malformed and invalid_claim can reflect attacks,
stale clients or misuse: use rate-based monitoring. limiter_call_exception also
warrants rate-based provider/load investigation. Logs must never include full rt,
JWT, private key, JWKS body, arbitrary destination URL or raw exception text.
No Cloudflare alert resources are created; operators must separately verify their
alert routing. See [recovery](rollback-recovery.md) and [production gates](production-configuration.md).
