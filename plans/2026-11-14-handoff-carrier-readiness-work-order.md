Task (umaxica-apps-edge-jump): make Jump ready to carry the Access <-> Governance front-channel
handoff. Part 1 starts now. Parts 2 and 3 wait for owner decisions that will be delivered to you;
until then prepare them (investigation, failing tests, proposal) without merging behaviour changes.
No commit unless the owner asks. Never print secrets or key material. Deploys, secret changes and
any Cloudflare change need the owner's approval at execution time.

Written on the Cosmos machine on 2026-11-14 from a read of commit `2a24a0b`; the tree here may be
newer. The current tree, accepted ADRs and docs in this repository are authoritative; report
conflicts instead of resolving them silently. This order follows
`plans/2026-11-13-cosmos-decisions-gap-check-work-order.md`; where that order's items 3 and 6
overlap, reuse its results instead of repeating the work.

## Why now

The owner's next milestones are sign-up, sign-in and sign-out across the Cosmos repositories.
Access keeps the ceremonies; Governance owns identities and credential records; they exchange
signed Handoff JWS only through the browser, navigated by Jump `rt` (no server-to-server calls).
All four Cosmos repositories now sign and verify PS256 only. Until Jump serves a consistent key
set and permits the Access <-> Governance edges, nothing can be verified end to end.

Jump's role does not change: it redirects, holds no business state and never interprets the
Handoff JWS. No new lane, no second redirect mechanism.

## Part 1 (start now): finish the key rotation

Observed from the Cosmos machine on 2026-11-12: the deployed version fails closed (JWKS 503)
because the private secret, `UMAXICA_JUMP_PRIVATE_KEY_KID` and `UMAXICA_JUMP_PUBLIC_JWKS` do not
form one consistent set. Not re-verified since.

1. Confirm the current deployed state (version, JWKS response status) without printing key
   material.
2. Follow `docs/operations/key-rotation.md`, section "Pre-launch rotation: close, replace, verify,
   reopen". Ask the owner for approval before each step that changes a secret, a variable or a
   deployment.
3. Verify afterwards: JWKS returns 200 with public RSA PS256 keys only (modulus 3072 bits or
   larger, no private members); the published `kid` equals the signing `kid`; an `rt` issued by a
   local test key is refused; `docs/operations/deployment-verification.md` items pass.
4. Record the result in `evidence/` (statuses, `kid` values, version identifiers; no key material)
   and report to the owner the JWKS URL and `kid` the Cosmos repositories must trust.

## Part 2 (prepare now, apply on decision): Governance in the registry

Pending owner decision: Governance receives its own namespace, issuer and JWKS (recommended), not
an alias of Auth or Visa. The host names for the APP and ORG realms will be supplied by the owner.

Prepare:

- Report how `src/config/registry.umaxica.ts` and the lane rules represent Access today, and the
  exact additions needed for Governance: issuer namespaces, issuer origins, JWKS URL (one per
  repository, served by every host of that repository), permitted destinations, and the directed
  edges Access -> Governance and Governance -> Access for each realm. APP and ORG stay separate;
  no cross-realm edge.
- Write the tests first (Red): each new edge permitted; the reverse of any edge not listed
  refused; a Governance issuer cannot reach destinations outside its edges; an Access key cannot
  sign as Governance and the reverse.
- List what `docs/receiver-contract.md`, `docs/redirect-policy.md` and `docs/rails-handoff.md` must
  say for the new edges.

Apply only after the owner delivers the host names and confirms the namespace decision.

## Part 3 (prepare now, apply on decision): destination URL limit

`src/core/verify_jwt.ts`: `MAX_URL_LENGTH = 2048`, `MAX_TOKEN_LENGTH = 4096`. Measured on the
Access side with an RSA 3072 key: a minimal PS256 Handoff JWS is 1,036 characters, 1,075 as a
query URL. Handoffs that carry personal data (for example a verified email address at sign-up
registration) will be signed and then encrypted (nested JWE to the receiver's RSA key), which is
expected to exceed 2,048. The real maximum will be measured on the Access side and delivered with
the decision.

Prepare:

- Report every place that enforces or assumes a URL or token length (Jump code, tests, docs,
  Cloudflare limits for request line and headers, known browser limits) and which one binds first.
- State the relation between the two constants: the `rt` embeds the destination URL, so give the
  `rt` length that results from a destination URL of 2,048, 3,072 and 4,096 characters with the
  current claims and an RSA 3072 signature, and the `MAX_TOKEN_LENGTH` each would need.
- Propose values with reasons and the cost of each (parsing work per request, log volume, abuse
  surface, rate-limit interaction). Do not change a limit on your own.
- Confirm destination query parameters are preserved byte for byte and never written to logs,
  traces or error paths at any length; boundary tests below, at and above each limit.

Apply only after the owner confirms the values.

## Report

Evidence in `evidence/YYYY-MM-DD-handoff-carrier-readiness.md` (full `git rev-parse HEAD`; whether
uncommitted changes affected results): Part 1 result; Part 2 additions and Red tests; Part 3
measurements and proposal; items still `NOT_VERIFIED`; decisions needed from the owner.
