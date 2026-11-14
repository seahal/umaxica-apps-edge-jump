# Handoff carrier readiness, excluding key rotation

Source: `68153478a3eb03ac85964298ce400d582f6f025d`, reviewed 2026-11-14.
The owner's packageManager hash correction and this task's new tests, measurement
script and documentation were uncommitted. No application behaviour or upper
limit changed. Key rotation, Access closure/reopening, version uploads and
deployments were excluded by the owner; none was performed. This is not a key
rotation operation record or production acceptance.

## Reproducible size calculation

Executed `pnpm exec node scripts/measure-carrier-sizes.mjs` with installed pnpm
12.18.0. It emits lengths only, using ASCII JSON/base64url and the fixed
512-character RSA-3072 signature length. No keys or live tokens are needed.
Claims use ten-digit timestamps, a 36-character UUID JTI, `kid: same-kid`,
the Base APP issuer and production JWT typing. The larger column substitutes
the allowed 128-character kid and JTI. URL content is ASCII without JSON quotes
or backslashes; these figures are exact for this serialization model, not a
universal worst case for all issuers, escaping or nested encryption.

| Destination characters | Input RT | Input RT, max kid/JTI | Output RT | Final Location |
| ---------------------- | -------- | --------------------- | --------- | -------------- |
| 1026 (authorization)   | 2255     | 2537                  | 2299      | 3329           |
| 2048                   | 3617     | 3900                  | 3661      | 5713           |
| 3072                   | 4983     | 5265                  | 5027      | 8103           |
| 4096                   | 6348     | 6631                  | 6392      | 10492          |

The authorization fixture includes all nine specified OIDC parameters, a
700-character synthetic state, 43-character PKCE challenge and encoded callback.
It has 1022 characters of URL headroom and 1841 of input-RT headroom (1559 with
max kid/JTI). It models a state of the requested size, not the actual Access
credential record or encrypted Handoff. Signed state and RT success are tested
separately with existing ephemeral test keys in the production-contract suite.

## Bounds and candidate values

- `src/core/verify_jwt.ts`: overall input RT <=4096 before decoding; signature
  exactly 512 characters; destination URL <=2048; JTI <=128; closed claims and
  NumericDate bounds. Issuer kid <=128 in `src/core/issuer_jwks.ts`.
- `src/core/handle_jump.ts`: output RT <=8192 after signing; Location includes
  both the original destination URL and its encoded copy inside output RT.
- `normalize_url.ts` and `redirect_policy.ts` enforce encoding, pathname,
  duplicate/special query and origin rules independent of length; input raw
  query is preserved before appending RT. No destination fetch is made.
- `docs/protocol.md` and `docs/rails-handoff.md` state the input URL/RT limits;
  README repeats the RT bound. `test/production-contract.test.ts` tests input
  token boundaries; this task adds URL boundary/privacy assertions. No separate
  smaller RT limit was found in the local E2E/Worker scripts.
- Cloudflare's current [limits](https://developers.cloudflare.com/workers/platform/limits/)
  list URL 16 KB and request/response headers 128 KB total (retrieved today).
  Both the Jump entry URL and receiver Location URL matter. Current application
  limits bind before those platform limits for these ASCII fixtures. Browser,
  reverse-proxy and actual Rails request-line limits remain NOT_VERIFIED; do not
  treat the platform ceiling as an interoperability guarantee.

Recommendation: keep 2048/4096 for the currently modeled authorization entry.
If Access's measured encrypted handoff requires larger URLs, consider
URL/RT = 3072/6144 or 4096/8192 together, subject to owner choice and actual
serialized payload evidence. Raising only URL length will leave the input RT
limit binding. The existing output 8192 bound fits the modeled candidates;
JSON escaping or other claim/header sizes can consume headroom. Both independent
limits would still apply; no promise that every URL at the URL limit is accepted.
No values were changed.

The 4096 URL candidate approximately doubles URL parsing and JSON/base64 work
versus 2048; model input RT grows from 3617 to 6348 characters, and final Location
from 5713 to 10492. This is a size comparison, not a CPU benchmark. RSA signature
verification count is unchanged, but memory/copy/response bandwidth and abuse
cost per accepted request rise. Current logging omits tokens and destination
queries, so larger values should not increase application log payload by their
length; deployed platform redaction is a separate unverified gate.

## Rate limit and availability

Configured limit remains 600 requests per 60 seconds per IP. At 2/4/6 Jump
visits per ceremony, arithmetic ceilings are 300/150/100 ceremonies per minute
per shared IP, before health/JWKS/assets and other requests. These are not
capacity or provider enforcement guarantees; shared NAT and retries reduce
margin. No rate-limit change or load test was performed.

`docs/operations/deployment-verification.md` distinguishes liveness, signing
material readiness and signed redirect smoke. `release-closure.md` and
`rollback-recovery.md` require an immutable compatible recovery version and
external receiver evidence. A health 200 cannot establish signer readiness.
Current deployed binding consistency, valid/invalid issuer smokes, public JWKS,
platform privacy, alert delivery and a verified rollback artifact remain
NOT_VERIFIED in this task. The 503 in the new work order is owner-supplied prior
evidence, not a fresh production observation by this review.

Owner/Access follow-up: actual encrypted Handoff size and desired limit values;
Base/Core/Warp/.com ownership decisions; real issuer/receiver interoperability.
Key work and release operations remain with the owner under the staged rotation
order. Local application checks are recorded in
[Base App authorization evidence](2026-11-14-base-app-authorize-edge.md).
