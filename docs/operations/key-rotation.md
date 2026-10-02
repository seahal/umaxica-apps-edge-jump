# Signing key bundle rotation, recovery and emergency revocation

This change does not rotate existing production secrets, kid or JWK values.
Tests generate isolated nonproduction keys. Runtime accepts only canonical
UMAXICA_JUMP_PRIVATE_KEY_PEM/KID and UMAXICA_JUMP_PUBLIC_JWKS. The public key set must
include active; no deriving active from private, kid dates or array order.
Private PKCS#8 import is extractable:false, and active public verifies a probe.
All public keys must import as EC/P-384/ES384 with valid coordinates/kid/use,
verify-only key_ops when present, no duplicate kid or private fields. Importing
other public keys does not prove they pair with active private.

## Normal A→B rotation

| Stage                         | Signing private/kid | Explicit public JWKS |
| ----------------------------- | ------------------- | -------------------- |
| Prepublish                    | A                   | A+B                  |
| Activate                      | B                   | B+A                  |
| Retire after approved overlap | B                   | B                    |

B becomes verification trust when published; calling it future does not prevent
receivers accepting a B signature. Active selection governs issuance separately.
Do not replace material under an existing kid. Preserve A in an approved secret
backend while returning to A issuance remains an authorized recovery option.
Public verification distribution does not need A's private key.

Prepare each stage as a consistent, tested Worker version with private/kid/public
bundle and required security code. Record actual version ID and secret/config
references. Individual sequential live changes to private key, active kid and JWKS are forbidden; require atomic deployment of the consistent immutable Worker version. Worker secrets uploaded
with a version differ from external Secret Store bindings: an immutable binding
reference alone does not prove an externally mutable secret value is versioned.
Use approved backend/versioned references and verify deployment semantics first.

For local nonproduction key generation use `pnpm run keys:generate` into a fresh
private directory; inspect generator help/arguments before use. Never write real
private material to repository, stdout, evidence or shell arguments.

## Timing gates

Prepublication wait is chosen from measured receiver JWKS cache/refresh behavior
and deployment propagation, with operational margin, before B begins signing.
Old-key retention is a separate period starting at the LAST time A could sign,
including delayed propagation or recovery deployments:

`retire_A >= last_possible_A_sign + 30s TTL + 5s leeway + propagation bound + receiver cache/refresh bound + maximum CDN stale policy (if present) + operational margin`.

Fill propagation/cache/refresh/margin and the signing stop timestamp from actual
measurements; they are UNVERIFIED here. Do not assume instantaneous worldwide
deployment or invent a universal cache time. If bounds are unknown, do not retire.

## Commands for an authorized deployment owner only

Installed Wrangler 4.143.0 help was checked locally for `versions upload`,
`versions deploy`, and `deploy`; none of the following mutations was executed.

```sh
pnpm exec wrangler versions upload --strict --tag '<stage-tag>' \
  --message '<reviewed-bundle>' --secrets-file '<approved-private-bundle-file>'
pnpm exec wrangler versions deploy '<uploaded-version-id>@100%' \
  --message '<reviewed-activation>'
```

Help describes secrets-file as additive: omitted previous secrets are not deleted.
Do not interpret omission as removal/revocation. Confirm account/backend behavior,
configuration references and exact uploaded ID before authorization. Official
[secrets](https://developers.cloudflare.com/workers/configuration/secrets/) and
[rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
documentation complements CLI help; neither proves receiver compatibility.

## Recovery

After B activation, recovery may use an A-signing prepublish version exposing A+B,
provided it retains rpl reuse, security fixes, forbidden edges and revocations.
Do not revert to A-only while valid B tokens may exist. Before retiring B trust,
account for the last possible B issuance and the same measured timing bounds.
A prior 0.1 version missing output rpl is not a safe target even after TTL expires.
No safe actual artifact/version is verified: BLOCKED_FOR_ROLLOUT until prepared.

## Emergency compromise

Separate emergency response from normal grace. Deploy revoked-kid checks in Jump
for affected issuer keys; receiver-owned Jump-key revocation must be coordinated
externally. Removal from public JWKS alone does not immediately stop warm cached
verification. Stop affected issuance, preserve incident evidence without secrets,
and never resurrect a revoked key via rollback. Compromised keys do not get a
normal grace allowance. Rails changes and actual backend operations are outside
this repository task.

## Explicit lifecycle and emergency completion

Exactly one active private key and exactly one active kid are configured. Public
JWKS = active public key + zero or more grace keys + zero or more prepublished
future keys. Phase A: private=A, active kid=A, JWKS=[A,B]. Phase B: private=B,
active kid=B, JWKS=[B,A]. Phase C after the measured grace window: private=B,
active kid=B, JWKS=[B]. No runtime derivation fallback exists or may be restored.

If A is compromised, do not grant A grace. Coordinate receiver-side revocation
before or simultaneously with replacement: generate B, activate B atomically,
remove A from public JWKS, and ensure receivers reject A even if CDN/receiver
caches retain it. If necessary purge the exact configured JWKS URL. Jump does not
own receiver revocation state. **Jump JWKSから消しただけでは emergency revoke 完了ではない**.
Never roll back to compromised A. Rails code and live secrets are unchanged here.

See [recovery artifact requirements](rollback-recovery.md) and
[origin cutover](origin-cutover.md). rollback-compatible immutable artifact:
NOT YET VERIFIED. ROLLOUT_STATUS = BLOCKED_FOR_ROLLOUT.
