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

## Safe Logs

```text
level=warn event=jump_reject reason=expired request_id=... status=400
level=info event=jump_accept iss=https://auth.example dst=internal dst_origin=https://www.example status=302
```

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
redacted structured logs are kept. The test
`cloudflare observability never enables invocation logs` guards the config value; it cannot guard an
override applied in the Cloudflare dashboard.

**The 30-day retention above is an account-level setting.** Workers Logs retention is configured per
account, not in `wrangler.jsonc`, so the repository cannot assert it. Confirm the account is set to
30 days before rollout and re-confirm after any change to the observability configuration.
