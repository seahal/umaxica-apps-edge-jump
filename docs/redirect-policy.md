# Jump 0.4.0 candidate redirect policy

Status: local implementation; RELEASE_BLOCKED. This policy describes the
candidate source, not the deployed gateway. JWT schema remains 1.

## Evaluation boundary

Existing rate limiting, request metadata and deadline checks remain before
entry/JWT handling. The entry accepts only the existing method/path/raw query
contract. Signature, registered issuer, JOSE header, time and exact required
claims (including `dst: internal`) precede destination URL checks. A URL must use
explicit `https://` syntax, pass existing control/encoding/userinfo/host checks,
and its normalized origin must be an allowed edge of the issuer. Only then are
raw and normalized direct pathnames, origin-specific path rules and transfer
query controls evaluated. No rule can add an edge. No destination is fetched.
Accepted targets retain the signed query bytes, fresh outbound
jti, ES384 and 30-second TTL, followed by one outbound RT and 302.

Direct pathnames reject empty interior segments, double slashes, raw or encoded
backslashes/semicolons/controls, malformed percent sequences, encoded slash,
encoded percent and dot segments (literal or encoded, including mixed forms).
Trailing slash and UTF-8 paths are otherwise valid. Percent-encoded ordinary
characters remain permitted; deny rules compare the once-decoded pathname, so
`/sign/%6fut` cannot evade `/sign/out`. Suspicious input is refused, never repaired.
This strict pathname syntax is never recursively applied to a query's URL path.
Existing control and encoding restrictions remain in place for each URL component. Decoded
backslash rejection applies to the direct pathname, not opaque query values.
OAuth `state=a%5Cb` retains the value `a\b`; the original query bytes
are shared by the output claim and Location. Authority, direct pathname, query and
fragment are separated before encoding/control validation; the whole URL is never
decoded for path matching. Raw component extraction does not authorize origins.
See [RFC 6749 Appendix A.5](https://www.rfc-editor.org/rfc/rfc6749.html#appendix-A.5).

## Static path denial

`src/core/redirect_policy.ts` validates and freezes its static rules at module
initialization. Origins must be canonical HTTPS origins; paths must pass strict
syntax and cannot end with a slash except `/`. Exact rules match the configured
path and its single trailing-slash variant. Subtree rules additionally match only
`path/` descendants, never `/foobar` for `/foo`. The root subtree denies every
path at that exact origin. Invalid modes/settings fail at startup.

The twelve Base, Core, Warp and Auth origins in the fixed graph deny `/sign/out`, its trailing slash and Rails implicit
format suffixes with or without a terminal slash (for example `.html`, `.json/`,
`.HTML/`, `.arbitrary/`). The comparison removes one terminal slash from a
comparison-only value before checking the format suffix; it never rewrites the
destination. Base paths remain case-sensitive. Descendants such as
`/sign/out/edit` remain eligible under an exact rule. This denial targets the
actual Base/Core/Warp GET completion action, which consumes logout notice state
or continues a browser logout transaction, and Auth forwarding into that action; it is not an assertion of an unauthenticated
Rails vulnerability. Route and deployment completeness remains a release gate.

## Transfer query and domain defense

Generic redirect controls `next`, `return_to`, `return_url`, `redirect`,
`redirect_url`, `url`, `continue` (case insensitive, including bracket forms)
are refused. No reviewed receiving-route contract authorizes these through Jump.
This is intentional acceptance tightening, including relative values. Issuers
must remove them or obtain a separately reviewed route-specific contract before
use. A signed token cannot authorize an unknown secondary redirect.

`redirect_uri` and `post_logout_redirect_uri` are separately parsed absolute
URIs. Reject invalid syntax, credentials, fragments, unsafe protocols, special
hosts and prohibited domains. Do not re-decode or rewrite their values. HTTPS
OAuth client URIs need not use one of Jump's 15 origins. Native private-use
schemes can remain syntactically eligible; registration is verified by Rails.
For `redirect_uri` only, RFC 8252 IPv4/IPv6 loopback HTTP is permitted inside the
OAuth parameter (`127.0.0.1` or `[::1]`, including a port); direct Jump
navigation remains HTTPS-only. This does not identify or register a native
client, and Rails must reject an unregistered URI/client pairing.

Duplicate single-valued protocol keys and bracket aliases are refused.
`state` and `nonce` remain opaque; text containing `example.com` is not a domain
match. Query bytes are retained in the output claim and Location.

Parsed hostname matching uses lowercase normalization, removes a terminal dot
for comparison, and matches only equality or dot-boundary subdomains:

- IANA example domains: `example.com`, `example.org`, `example.net`.
- UMAXICA policy additions: `example.dev`, `example.app`, `exampe.net`, `exampe.dev`.
  The latter two are deliberate strings, not corrected spelling.
- Special-use suffixes: localhost, local, internal, arpa, alt, onion, invalid,
  test, example; existing IP/special-host restrictions also apply.

The production registry builder additionally refuses these hostnames at startup.
Unit tests can inject illustrative example origins, but production uses the
fixed registry; no environment flag disables production denial. Positive OAuth
fixtures formerly using `client.example` now use `client.umaxica.com`. Negative
example-domain tests remain. A denylist does not prevent all unknown external
hosts; direct destinations remain constrained by the complete origin graph, and
OAuth registration and secondary receiver behavior remain Rails responsibilities.

## Standards and limits

OWASP's project page identifies ASVS 5.0.0 as the latest stable version. The
review uses the tagged stable requirements, not master/bleeding-edge content:
`v5.0.0-1.1.1` (decode once), `v5.0.0-1.2.2` (safe URL construction),
`v5.0.0-1.5.3` (parser consistency), `v5.0.0-3.7.2` (redirect allowlist),
`v5.0.0-3.5.3` (safe methods), and `v5.0.0-3.4.3`/`3.4.5` (CSP/referrer).
This is a scoped mapping, not ASVS certification or full conformance.

References: [ASVS stable release](https://github.com/OWASP/ASVS/tree/v5.0.0/5.0/en),
[OWASP redirect guidance](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html),
[CWE-601](https://cwe.mitre.org/data/definitions/601.html),
[WHATWG URL](https://url.spec.whatwg.org/),
[RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html) §§2.1, 4.1, 4.11,
[RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html) §7,
[RFC 8725](https://www.rfc-editor.org/rfc/rfc8725.html),
[IANA example domains](https://www.iana.org/help/example-domains).

RFC 9700 exact registered redirect matching, client/realm binding, PKCE,
state/nonce, authorization-code binding and OAuth-client open-redirect defense
belong to Rails. Its source has exact URI membership and request validation,
but current runtime, integration, receiver TTL and complete live-route coverage
are NOT VERIFIED. See the dated evidence and release closure gates.

The inspected Palm GET `/sign/out` only renders a notice after transaction/state
checks; POST starts logout. It is not included in this denylist. This is based on
source review, not a claim that all deployed routes have been audited. Current
Rails Auth helpers explicitly issue RTs to Base `/sign/out`: this legitimate
logout flow will be refused by the candidate and requires coordinated issuer/
receiver redesign or a separately proven route contract before release.

The [path boundary design](security/jump-0-4-path-boundary-design.md) records the
normalization threat, comparison rules, maintenance procedure and independent
Rails P0 follow-up. The [remediation evidence](../evidence/2026-10-11-path-boundary-remediation.md)
records actual RED/GREEN and runtime verification status. The internal path
denylist is UMAXICA-specific defense; ASVS 3.7.2 addresses external-host redirects.
