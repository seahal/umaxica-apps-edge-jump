# Request and ADR Proposal: Display Preference as a Query Parameter (2026-11-12)

Status: **proposal; not adopted.** The owner will decide later. Nothing is implemented.

## Request (from the Cosmos repositories)

Jump cannot read Cosmos preference cookies: it runs on another domain. When a person who chose a
light or dark theme in Cosmos passes through Jump, the page falls back to the browser setting, so the
look can change abruptly. The owner asks that Jump follow the person's chosen theme.

- The Cosmos link issuer appends `theme=light` or `theme=dark` as a plain GET query parameter,
  separate from the signed token, only when the stored preference is not `sys` (system default).
- The owner rejected carrying preferences inside the signed token (felt riskier).
- Language is not passed now; it may be added later by the same mechanism.
- Jump has no page except errors, so the parameter only styles error pages.

## Proposed ADR (draft 0008: Display Preference Query Parameter)

### Context

Jump verifies a signed token from Cosmos and must not trust anything else in the request. A theme is a
display hint with no security meaning.

### Decision (proposed)

1. Jump accepts one optional query parameter, `theme`, with the values `light` and `dark`.
2. The parameter is untrusted and display-only. It never affects token verification, issuer,
   audience, purpose or destination checks, routing, or any other decision. The signed token and its
   verification are unchanged.
3. Missing, repeated, unknown or invalid values are ignored; the page then follows CSS
   `prefers-color-scheme` (no JavaScript).
4. The value is never reflected unescaped, never logged, never copied into an onward link or a
   return token, and does not create cache variants (responses stay `no-store`).
5. Adding another preference (for example language) requires amending this record.

### Consequences

- Consistent look across Cosmos and Jump for people who chose a theme.
- A tampered parameter changes only the look; a tampered token is still refused.
- Cosmos must amend its `adr/secure-jump-link-redirector.md` ("no raw values next to `rt`") with
  this display-only exception.

### Tests (when adopted)

Parameter omitted for `sys`; each valid value applied; invalid, repeated and unknown values
ignored; tampered token still refused regardless of the parameter; no value in logs.

Related: adr/0007-remove-external-destinations.md, plans/2026-11-11-oidc-protocol-redirects-bypass-jump.md; Cosmos Access
`docs/backlog/2026-11-12-jump-away-preference-query-parameters.md`.
