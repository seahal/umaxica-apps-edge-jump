Task (umaxica-apps-edge-jump): check this repository against the Cosmos decisions of 2026-11-12 and
2026-11-13 and close any implementation gap. Much of this may already be done; verify from the
current tree, report each item as "already satisfied" (with file and test) or fix it with a failing
test first. No commit unless the owner asks. Never print secrets or key material. Deploys, secret
changes and any Cloudflare change need the owner's approval at execution time.

Written on the Cosmos machine from a read of commit `0eb2959`; the tree here may be newer. The
current tree, accepted ADRs and docs in this repository are authoritative; report conflicts instead
of resolving them silently.

## Decisions to check against

1. **PS256 only, complete cut-over (owner, 2026-11-13).** Every first-party JWT is PS256 with RSA
   3072 or larger; there is no period in which ES384 is also accepted. Access migrates its issuers
   and verifiers in one step (Access `plans/2026-11-13-access-ps256-migration-work-order.md`).
   Check: inbound `rt` verification accepts only PS256 keys (`kty` RSA, `alg` PS256, `use` sig,
   modulus floor 3072, header `alg` equal to the key's `alg`, no algorithm taken from the token
   alone); outbound signing is PS256; no ES384, RS256, PS384, `none` or HMAC path remains in `src/`,
   tests, fixtures, docs or the receiver contract. Observed: no `ES384` string in `src/` at
   `0eb2959`; confirm tests cover the refusals and the size boundary (below, at, above).
2. **One signing key set and one JWKS per repository** (Access ADR
   `cosmos-jwt-ps256-and-op-signing-in-aws-kms.md`, amended 2026-11-10): every host of a Cosmos
   repository serves the same `/.well-known/jwks.json`. Check `src/config/registry.umaxica.ts`
   against the split: which origins belong to Access, Governance, Sphere and Press, which JWKS URL
   each issuer uses, and that no origin of a removed surface (`com` where it was deleted) remains.
   Report the mapping; ask the owner where ownership is unclear.
3. **Jump is now the carrier between Access and Governance (owner, 2026-11-13).** The two
   applications make no server-to-server API calls; they exchange a signed Handoff JWS in the query
   string of the destination URL, navigated by Jump `rt` in both directions
   (Access `adr/access-is-a-pure-openid-provider.md` decision 18 and Access
   `plans/2026-11-13-jump-front-channel-handoff-work-order.md`). Jump's role does not change: it
   redirects, holds no business state and never interprets the Handoff JWS. Check and report:
   - Access -> Governance and Governance -> Access are both permitted by the registry and lane
     rules (`pt` / `nt` / `xt` unchanged; no new lane, no protocol change);
   - destination query parameters are preserved byte for byte and never logged (invocation logs,
     traces, error paths), and responses carry `Cache-Control: no-store` and
     `Referrer-Policy: no-referrer`;
   - **size**: `MAX_URL_LENGTH = 2048` and `MAX_TOKEN_LENGTH = 4096` in `src/core/verify_jwt.ts`.
     A PS256 JWS is roughly 700 to 1200 characters before its claims grow, so a destination URL
     carrying one may approach 2048, and the `rt` that embeds that URL approaches 4096. Measure
     with a realistic handoff (one credential record, RSA 3072 signature) and report the headroom.
     Do not raise a limit on your own: propose the value with the reason, and the owner decides.
     Payloads are being designed small on the Access side; a shared `Domain` cookie was rejected;
   - **rate limit**: a ceremony now passes through Jump two to four times (more with a nonce round
     trip). Check `JUMP_RATE_LIMITER` (600 per 60 s per IP) against that and report the expected
     margin for shared IPs;
   - **availability**: Jump is now on the critical path of sign-in; list what the docs promise
     (rollback, recovery artifact, health) and what is still `NOT_VERIFIED`.
4. **JWKS fetch stays (owner, 2026-11-13).** Fetching issuers' published JWKS over HTTPS is allowed
   and unchanged: cache, refetch on unknown `kid`, fail closed. Access and Governance will publish
   RSA PS256 keys only.
5. **Lifetimes.** Access uses `JUMP_RT_TTL = 30 seconds`; receivers accept Jump's 30-second
   outbound lifetime. Confirm the values agree with `docs/receiver-contract.md`.
6. **Key rotation lesson (2026-11-12).** A secret was replaced while the deployed version still had
   the old `kid` and JWKS variables; the version failed closed (JWKS 503), as designed. The Cosmos
   machine holds an uncommitted edit to `docs/operations/key-rotation.md` ("Pre-launch rotation:
   close, replace, verify, reopen") and `evidence/2026-11-12-key-rotation-ps256.md`; they will be
   pushed separately. Check that the private secret, `UMAXICA_JUMP_PRIVATE_KEY_KID` and
   `UMAXICA_JUMP_PUBLIC_JWKS` in the version to be deployed form one consistent set, and that the
   runbook says to close Jump before rotating. Deployed state when written: version
   `8b73e1b8-be84-418b-b669-d4aacfbe9a13` at 100% (inconsistent set), rollback target
   `0d0f9206-f1b1-428d-b1ee-fdf085c55479`. Report the current state; do not deploy without approval.
7. **Node.** Move to the Node 26 LTS line (`docs/backlog/2026-11-12-node-lts-26.md`, pushed
   separately) if not done.
8. **Static checks.** The Cosmos repositories now require every CI static check to report zero
   problems without suppression. Report whether this repository's checks are clean and whether any
   suppression or ignore file exists.

## Report

Record in evidence/YYYY-MM-DD-cosmos-decisions-gap-check-XXXX.md (full `git rev-parse HEAD`;
whether uncommitted changes affected results): each item above with its status, changed files and
tests, measured sizes and margins, the issuer mapping, open questions for the owner, and checks run
with results.
