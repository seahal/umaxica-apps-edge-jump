# Jump 0.3 protocol (normative)

Production has exactly these 13 nodes. Node ID syntax is
`^[a-z]{4}-[a-z]{3}-[a-z]{2}$` (11 ASCII characters); syntax alone grants no trust.
ww means global; jp is regional. ri=us changes no identity. No us node or alias.
JWT iss/aud/src are origins, never Node IDs. Every node is issuer and destination,
with issuer JWKS exactly `<origin>/.well-known/jwks.json`.

| Node        | Canonical origin            |
| ----------- | --------------------------- |
| auth-app-ww | https://auth.umaxica.app    |
| auth-com-ww | https://auth.umaxica.com    |
| auth-org-ww | https://auth.umaxica.org    |
| base-app-ww | https://www.umaxica.app     |
| base-com-ww | https://www.umaxica.com     |
| base-org-ww | https://www.umaxica.org     |
| core-app-jp | https://jp.umaxica.app      |
| core-com-jp | https://jp.umaxica.com      |
| core-org-jp | https://jp.umaxica.org      |
| warp-app-jp | https://www-jp.umaxica.app  |
| warp-com-jp | https://www-jp.umaxica.com  |
| warp-org-jp | https://www-jp.umaxica.org  |
| palm-app-jp | https://palm-jp.umaxica.app |

| Source      | Allowed internal destinations                      |
| ----------- | -------------------------------------------------- |
| auth-app-ww | base-app-ww                                        |
| auth-com-ww | base-com-ww                                        |
| auth-org-ww | base-org-ww                                        |
| base-app-ww | auth-app-ww, core-app-jp, palm-app-jp, warp-app-jp |
| base-com-ww | auth-com-ww, core-com-jp, warp-com-jp              |
| base-org-ww | auth-org-ww, core-org-jp, warp-org-jp              |
| core-app-jp | base-app-ww                                        |
| core-com-jp | base-com-ww                                        |
| core-org-jp | base-org-ww                                        |
| palm-app-jp | base-app-ww                                        |
| warp-app-jp | base-app-ww                                        |
| warp-com-jp | base-com-ww                                        |
| warp-org-jp | base-org-ww                                        |

This is 20 allowed edges out of 169 ordered pairs; all other 149 are denied.
Auth↔RP, RP↔RP, self, cross-TLD, Edit and old www.jp/jpx/palm/palm.jp hosts are
not aliases. zzzz/zzz/zz is an unregistered sentinel only.

Inbound: exactly the claims schema 1 (number), rpl `reuse`, registered origin
iss, aud string equal to the configured Jump identity, sub `jump-redirect`,
iat/nbf/exp positive integers ≤ 4102444800, jti 1–128 printable ASCII, dst
`internal`, url 1–2048 characters without control characters. Any other claim is
refused. Protected header exactly {alg, kid, typ}: alg ES384, kid 1–128 without
control characters, typ `JWT` (production) or `jump-request+jwt` (staging).
Compact token ≤4096 characters with a 128-character signature. Exp follows iat,
nbf≤exp, TTL≤30s; clock tolerance 5s affects now comparisons only.

Internal output302: header {alg ES384, kid, typ `JWT` in production or
`jump-return+jwt` in staging}; schema1, rpl reuse, iss Jump identity, aud target origin,
sub jump-redirect, src issuer origin, dst internal, url canonical validated target,
iat=nbf=now, exp=now+30, fresh jti. One new rt is appended. Remove this rt then
WHATWG/URLSearchParams serialize to compare against output url; %20/+ can change
bytes without changing values. Existing rt/rt[...], fragments, ambiguous
URLs and duplicate single-valued protocol query parameters are rejected, not repaired.
No destination fetch. Output token size is also≤8192.

Entry GET exact `/` with the raw query exactly `?rt=` followed by three
Base64URL segments; nothing is percent-decoded. HEAD on the entry is 405 with
Allow GET. No-query `/` retains About guidance (GET/HEAD). rt or rt[...] at any
nonroot path is400, including assets/JWKS, before trailing-slash normalization.
Other unsupported methods are405 with Allow GET, HEAD. Request URL origin must
match required configuration; Host/Forwarded/X-Forwarded-Host never selects
protocol identity.

External destinations are refused: `dst` other than `internal` is400 without
signing, Location or cushion, for every issuer, and the registry has no external
allowlist (ADR 0007 runtime phase). The cushion page renderer remains as dormant
code until its removal phase.

Transport `rt` only as a query parameter. JWTs and protocol values must not be
placed in pathnames; native invocation logs and traces may persist arbitrary
paths and generated metadata under the accepted [logging policy](logging.md).
