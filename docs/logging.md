# Logging

## Policy

Logs should help operate Jump without storing redirect tokens or secrets.

## Must Not Log

- The `rt` query parameter must NOT be stored in access logs.
- Full JWTs must NOT appear in error logs.
- Malformed JWTs must be truncated or redacted.
- Complete request URLs and destination path, query, and fragment must not be logged.
- Do not log `jti`, token hashes, URL hashes, IP addresses or their hashes, Referer, User-Agent, or Cookie.
- Do not log private keys, secret binding values, JWT payloads, or token fragments.

## Allowed

- Internal request ID and Cloudflare Ray ID (when present).
- Runtime/service version, route class, method, status, internal result code, and latency.
- After successful signature verification: issuer, verified kid, destination class, and allowlisted destination origin.
- JWKS cache outcome and coarse upstream-failure category.
- Rate-limit operational outcomes (`client_ip_unavailable`, `limiter_unavailable`) without IP addresses or tokens.

Public HTTP responses expose only coarse `X-Jump-Error` classes. Internal reason codes stay in structured security logs.

## Safe Logs

```text
level=warn event=jump_reject reason=expired request_id=... status=400
level=info event=jump_accept iss=https://auth.example dst=internal dst_origin=https://www.example status=302
level=error event=jump_jwks_fetch_failed iss=https://auth.example reason=deadline_exceeded stage=fetch latency_ms=1000
```

`jump_jwks_fetch_failed` records the registry issuer, coarse failure reason,
fetch stage, elapsed time, the upstream HTTP status when one was received, and
sanitized native `error_name`, `cause_name`, and `cause_code` fields when
available. It never records the JWT, `kid`, destination URL, JWKS response body,
or raw exception message.

## Unsafe Logs

```text
GET /?rt=eyJ0eXAiOiJKV1Qi...
error="invalid jwt eyJ0eXAiOiJKV1Qi..."
dst="https://example.org/account?email=user@example.com"
```

## Malformed Token Handling

For malformed input, record only the request metadata and coarse category. Do not log the raw token, its length, or a hash. Raw audit logs are retained for 30 days and then automatically deleted; access must be least-privilege.

## Platform Log Settings (operational preconditions)

The application logger is not the only thing that writes a log line. Two settings live outside the
code and must be verified as part of any rollout — neither is enforceable by a unit test.

**Cloudflare invocation logs must stay disabled.** Invocation logs are emitted by the runtime and
record the full request URL, so for `GET /?rt=<jwt>` they would persist the inbound token and the
destination verbatim — the exact fields this document forbids. `redactLogLine` in `src/index.ts`
only covers the application's own request log and cannot reach them. `wrangler.jsonc` therefore sets
`observability.logs.invocation_logs: false` while leaving `observability.logs.enabled: true`, so the
redacted structured logs are kept. The application logger emits literal paths only for fixed public
routes; every other parseable path is recorded as `[redacted-path]`, so encoded token-like paths and
arbitrary customer paths are not retained.

**Query strings must be redacted at the platform.** `observability.redact_query_string: true`
removes request query strings (including `rt`) from Workers Logs and traces. Lowering
`head_sampling_rate` is not a substitute: a sampled leak is still a contract break.

**Persisted traces must stay off.** Automatic Fetch-handler traces include `url.full` and
`user_agent.original`. Wrangler can redact query strings but cannot drop User-Agent from traces,
so `observability.traces.enabled` and `observability.traces.persist` are both `false`, and no
trace destinations are configured. Do not re-enable persisted traces, and do not add an OTLP
destination, unless User-Agent can be excluded from the exported attributes.

The test `cloudflare observability never persists rt query strings or traces` guards these
config values; it cannot guard an override applied in the Cloudflare dashboard. Dashboard
trace contents were not inspected from this repository.

**The 30-day retention above is an account-level setting.** Workers Logs retention is configured per
account, not in `wrangler.jsonc`, so the repository cannot assert it. Confirm the account is set to
30 days before rollout and re-confirm after any change to the observability configuration.
