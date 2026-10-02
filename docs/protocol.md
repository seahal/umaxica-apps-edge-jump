# Jump 0.2 protocol (normative)

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

Inbound: object claims schema1, required string rpl reuse, registered origin iss,
exact string aud equal to configured Jump identity, sub jump-redirect, finite
iat/nbf/exp, nonempty string jti, dst internal/external, nonempty string url.
Header typJWT, algES384, kid1–128; compact token≤8192 characters. Exp follows iat,
nbf≤exp, TTL≤300s; clock tolerance5s affects now comparisons only. NumericDate
fractions remain accepted where jose accepts them. No arbitrary claims are copied.

Internal output302: schema1, rpl reuse, iss Jump identity, aud target origin,
sub jump-redirect, src issuer origin, dst internal, url canonical validated target,
iat=nbf=now, exp=now+30, fresh jti. One new rt is appended. Remove this rt then
WHATWG/URLSearchParams serialize to compare against output url; %20/+ can change
bytes without changing values. Existing rt/reserved nesting, fragments, ambiguous
URLs and duplicate single-valued protocol query parameters are rejected, not repaired.
No destination fetch. Output token size is also≤8192.

Entry GET/HEAD exact `/`, exactly one nonempty parsed rt and no other query.
No-query `/` retains About guidance. rt or rt[...] at any nonroot path is400,
including assets/JWKS, before trailing-slash normalization. Unsupported methods
are405 with Allow GET, HEAD. Request URL origin must match required configuration;
Host/Forwarded/X-Forwarded-Host never selects protocol identity. HEAD validates fully
and has the same status/headers without a body.

External capability remains available through explicit DI policy: exact issuer
allowlist, signed reuse and safe URL produce200 cushion, no Location, no automatic
navigation and no Jump RT forwarding. Escaping, punycode warnings,
noopener/noreferrer and CSP stay required. All13 production issuers have
allowed_dst_external=false and no allowed external origins. Future policy addition
requires separate approval; external cannot bypass internal prohibited edges.
