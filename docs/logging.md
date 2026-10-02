# Logging

## Policy

Logs should help operate Jump without storing redirect tokens or secrets.

## Must Not Log

These prohibitions apply to application events. Accepted platform metadata
persistence is described separately below.

- The `rt` query parameter must NOT be stored in access logs.
- Full JWTs must NOT appear in error logs.
- Malformed JWTs must not be logged, including fragments.
- Complete request URLs and destination path, query, and fragment must not be logged.
- Do not log `jti`, token hashes, URL hashes, IP addresses or their hashes, Referer, User-Agent, or Cookie.
- Do not log private keys, secret binding values, JWT payloads, or token fragments.

## Allowed

- Internal request ID and Cloudflare Ray ID (when present).
- Runtime/service version, route class, method, status, internal result code, and latency.
- After successful signature verification: issuer, verified kid, destination class, and allowlisted destination origin.
- JWKS cache outcome and coarse upstream-failure category.
- Rate-limit operational outcomes (including `limiter_call_exception`) without IP addresses or tokens.

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

For malformed input, record only approved metadata and a coarse category. Do not
log the raw token, its length, or a hash. Log access must be least-privilege.

## Native platform observability

`wrangler.jsonc` enables observability, logs, invocation logs and traces. Logs and
traces persist natively with `head_sampling_rate: 1` (100%).
`observability.redact_query_string: true` removes request query strings, including
`rt`, from platform logs and traces. Sampling is not a privacy control. The config
regression test freezes all these values and the absence of external destinations.
It cannot verify a deployed configuration or a dashboard override.

Transport `rt` only in the query. Do not put JWTs or protocol values such as code,
state or nonce into pathnames. Arbitrary pathnames and Cloudflare-generated
metadata, including automatic trace attributes, may persist in invocation logs
and traces: this is an accepted operational risk. Application path redaction
cannot alter platform events. The application logger emits literal paths only
for fixed public routes; other parseable paths become `[redacted-path]`.
The application prohibitions above remain in force, including raw query, arbitrary
URL, Authorization, Cookie, JWKS body and raw untrusted exception messages.

Only Cloudflare native retention is used. No 30-day retention has been implemented
or verified. No external OTLP, Logpush, R2 or S3 archive is configured; external
archiving is future work. Retention beyond Cloudflare's native service is not
guaranteed. Operators must verify their actual plan, retention and access controls
against [Workers Logs documentation](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
and [traces documentation](https://developers.cloudflare.com/workers/observability/traces/).
No production log or trace contents were inspected in this local hardening.

## Additional 0.2 hardening contract

See [deployment verification and incident monitoring](operations/deployment-verification.md): configuration/deployment reasons may warrant investigation after one occurrence; malformed/signature/destination failures use rate-based monitoring. No external alert configuration is changed.
