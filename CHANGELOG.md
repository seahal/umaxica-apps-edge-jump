# Changelog

## 0.4.0 — unreleased candidate

RELEASE_BLOCKED. No production deployment is established by this entry.

- Remove the unused Cushion renderer, external-only IDNA display, translations, styles and CSP script permission under explicit owner authorization. Keep external RT rejection and the splash back-button script.

- Add raw and normalized direct pathname checks; reject ambiguous encoding,
  separators and dot segments rather than repairing input.
- Add validated, immutable exact-origin pathname deny rules with segment and
  trailing-slash boundaries; deny actual Base/Core/Warp GET logout completion and Auth forwarding paths and
  their Rails format suffixes.
- Refuse unreviewed generic transfer controls. Validate OAuth URI syntax and
  parsed prohibited/special-use hosts separately, preserving legitimate HTTPS
  and registered native URI possibilities without changing state/nonce values.
- Retain the 13-node/20-edge/149-denial graph, required internal dst, schema 1,
  ES384, issuer-specific keys/revocation, 30s TTL, fresh outbound jti and headers.
- Preserve existing external-RT rejection. Dormant renderer removal awaits
  ADR 0007 production verification and is not complete.
- Refine reading spacing, focus and control contrast; style Health consistently.
  Add OS-only dark mode using CSS variables and prefers-color-scheme, synchronizing
  CSP hashes without adding theme JavaScript or storage.
- Pin Node 24.21.0; retain pnpm 12.0.0 and the existing lockfile/supply-chain policy.
- Tighten positive OAuth fixtures to avoid production-prohibited example hosts.

Breaking acceptance changes and issuer/receiver rollout order are documented in
[compatibility](docs/compatibility.md) and [redirect policy](docs/redirect-policy.md).
Service version 0.4.0 continues to use JWT schema 1.
