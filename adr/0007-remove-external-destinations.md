# ADR 0007: Remove external destinations from Jump

Status: proposed (2026-10-03). Not accepted; no code has changed.
Target release: 0.4.0.

## Context

Jump has two destination paths. `dst: internal` verifies the instruction
against the origin graph and answers a redirect carrying a freshly signed `rt`.
`dst: external` answers a cushion page and relies on the user to read the
destination and choose to continue; no Jump token is forwarded.

Every production issuer has `allowed_dst_external=false`, so the external path
is never taken in production. It still keeps code and surface alive: cushion
HTML rendering, punycode warnings, an inline script pinned by CSP hash, and the
external-origin allowlist validation.

The two paths rest on different trust models. Internal trust is mechanical:
signature, registered issuer and an approved edge. External trust is a human
decision on a warning page. They do not need to share the Jump signing key or
deployment.

## Proposal

- Jump handles internal destinations only.
- In 0.4.0, every `dst: external` instruction is rejected like any other
  invalid request. JWT schema stays 1; this matches current production
  behavior, so no issuer or receiver changes.
- Remove the cushion page, its inline script and CSS hash, and the
  `allowed_dst_external` policy.
- External destinations are not re-enabled in Jump. If a confirmation page for
  external links is needed later, it is designed as a separate system with its
  own ADR, without Jump's signing key or JWKS.

## Consequences

- The redirect path has one outcome on success, which simplifies the protocol,
  the README flow and the security review.
- Issuers that ever relied on `dst: external` in nonproduction setups lose that
  path; none does in production.
- Documents describing the cushion (`docs/protocol.md`, `docs/security.md`)
  need updating when this proposal is accepted.

## Open questions

- Whether `dst` should remain a required claim with the single value
  `internal`, or be dropped in a future schema.
