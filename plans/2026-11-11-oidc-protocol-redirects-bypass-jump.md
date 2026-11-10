# OIDC Protocol Redirects Should Not Pass Through Jump (2026-11-11)

Status: proposal from the Cosmos repositories; not decided. No code has changed here or in Cosmos.
Owner adjusts and decides in this repository.

## Observed in `umaxica-apps-cosmos-access` (2026-11-11)

- Visa returns the authorization response to a relying party on another host through Jump:
  `app/controllers/visa/app/authorization_base_controller.rb` (around lines 91 and 268) calls
  `redirect_to_same_origin_or_jump_url`, which redirects directly only for the same origin and
  otherwise through Jump (`app/controllers/concerns/common_redirect.rb`, line 98).
- The post-logout redirect to the relying party also goes through Jump
  (`app/controllers/concerns/visa_app_oidc_logout_endpoint.rb`, line 48).
- Jump forwards only to approved edges and fails closed otherwise
  (Cosmos `adr/secure-jump-link-redirector.md`).

## Why it is a problem

1. Standard relying parties expect the authorization response (`code`, `state`, `iss`) to arrive
   directly at their registered `redirect_uri`. A gateway hop is outside OpenID Connect.
2. A relying party that is not in Jump's approved edges cannot complete sign-in. The first case is
   the probe RP `umaxica-apps-mock-oidc` (`https://mock.umaxica.app`, `openid-client`), used to check
   Access against a certified FAPI 2.0 client.
3. The authorization code travels through another service. RFC 9700 warns that redirectors in the
   authorization response path are a leakage route; the Away design already keeps OAuth/OIDC
   redirects out of Away (`umaxica-apps-edge-away/plans/2026-11-10-away-interstitial-design.md`).
4. Cosmos `adr/secure-jump-link-redirector.md` already says OIDC registered callback URLs remain
   final-receiver identities rather than gateway URLs.

## Proposal

| Navigation | Today | Proposed |
| --- | --- | --- |
| Visa -> RP `redirect_uri` (authorization response) | through Jump | direct, exact match against the client registry |
| Visa -> RP `post_logout_redirect_uri` | through Jump | direct, exact match |
| RP -> Visa `/oauth/authorize` | varies by RP | direct |
| Visa <-> Auth inside the OP | through Jump | unchanged for now (invisible to RPs) |
| Other cross-site navigation | Jump / Away | unchanged |

Safety of the direct path: exact `redirect_uri` and `post_logout_redirect_uri` matching against the
code-defined client registry, plus `state`, `nonce`, PKCE and `iss`, protect the same thing the
approved-edge list protects for these two redirects.

## Effect on Jump

- Jump no longer needs RP callback and post-logout destinations in its approved edges; they can be
  removed once Cosmos changes.
- The Cosmos rule "Rails leaves its origin only through Jump and Away" gains one exception: OIDC
  protocol redirects to registered URIs. It needs an amendment of Cosmos
  `adr/secure-jump-link-redirector.md` when decided.

## Related

- Cosmos `specs/cosmos-cross-repository-connection/spec.md` (Development Approach: probe RP).
- `umaxica-apps-mock-oidc/docs/design.md` (probe RP routes and phases).
- RFC 9700, OAuth 2.0 Security Best Current Practice: https://www.rfc-editor.org/rfc/rfc9700.html
- RFC 9207, Authorization Server Issuer Identification: https://www.rfc-editor.org/rfc/rfc9207.html
