# Jump signing key rotation runbook

`UMAXICA_JUMP_PUBLIC_JWKS` is a **verification key set**, not a mirror of the single active private key.

Jump uses one private key to sign new redirect tokens (RTs). Receivers use the
public JWKS to verify those tokens. During normal rotation, the JWKS contains
both the new public key and any old public keys that receivers still need.

| Material                | Secret? | Count                    | What to do during rotation                                                                  |
| ----------------------- | ------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| Active private PEM      | Yes     | 1                        | Replace it with the new private key. Destroy the old key when the conditions below are met. |
| Active `kid` (key ID)   | No      | 1                        | Set it to the new signing key's ID.                                                         |
| Active public JWK       | No      | 1                        | Always include it in the JWKS.                                                              |
| Grace public JWK        | No      | 0 or more                | Keep it while old tokens may still be accepted.                                             |
| Prepublished public JWK | No      | 0 or more                | Publish it before the new key starts signing.                                               |
| Revoked public JWK      | No      | 0 in the JWKS            | Remove it during emergency response.                                                        |
| Revoked `kid`           | No      | Managed by each receiver | Reject it even when a cache still contains its public key.                                  |

In this runbook, **A** is the old key and **B** is the new key. A **receiver** is
an application that accepts an RT signed by Jump. A **grace period** is the time
when A no longer signs new tokens, but its public key remains available for old tokens.

Use the normal procedure only when A is still trusted. If A may have leaked,
go directly to [Emergency: a private key may be compromised](#emergency-a-private-key-may-be-compromised).

## How the keys are created

Generate a new P-384 key pair on a trusted offline machine:

```text
New P-384 key pair
  ├── private key → UMAXICA_JUMP_PRIVATE_KEY_PEM
  └── public JWK → merge into UMAXICA_JUMP_PUBLIC_JWKS

New key ID       → UMAXICA_JUMP_PRIVATE_KEY_KID
```

The generator writes the private key and its matching public key together.
The Worker does not derive a public key from its private secret. A public key
cannot be used to recover the private key.

Every public JWK must have `kty=EC`, `crv=P-384`, `alg=ES384`, `use=sig`, a unique
nonempty `kid` of at most 128 characters, and valid public coordinates `x` and `y`.
If `key_ops` is present, it must be exactly `["verify"]`. Private fields `d`, `p`,
`q`, `dp`, `dq`, `qi`, `oth`, and `k` are rejected. Duplicate key IDs are rejected.
Never put new key material under an old key ID.

The Worker selects the active public key by `UMAXICA_JUMP_PRIVATE_KEY_KID`.
Array order and dates in key IDs do not select the signer. The Worker signs a
probe with the private key and verifies it with the active public key. If they
do not match, signing fails closed. This check does not prove that receivers are ready.

## Before a normal rotation

1. Confirm the target account, Worker, environment, and configured JWKS URL.
   Record the current deployment ID, A's key ID, and the current public key set.
2. Identify every receiver owner. Confirm how each receiver refreshes its JWKS,
   how long it caches keys, and whether a CDN can serve stale JWKS responses.
3. Agree on the prepublication wait and the grace period using the timing rules below.
4. Prepare and test a recovery version that uses **B**, including B's private key,
   B's active key ID, and the required public key set. Keep the current security
   fixes and receiver contract. See [Rollback recovery](rollback-recovery.md).
5. Confirm how code, configuration, and secrets will be deployed together.
   Prepare a complete, consistent Worker version for each phase.

Keep private material in approved secret storage. Do not put private keys or
live tokens in Git, terminal output, shell arguments, tickets, or evidence files.
The commands below generate files; they do not deploy a Worker.

**Release gate:** a tested recovery version using B must be ready before B is
activated. A local working tree is not a recovery version. This runbook does not
verify a production recovery artifact; the repository's existing status remains
`BLOCKED_FOR_ROLLOUT` until its release gates have evidence.

## Normal rotation

| Phase           | Private key | Active key ID | Public JWKS                           |
| --------------- | ----------- | ------------- | ------------------------------------- |
| 0. Generate B   | A           | A             | A and any existing required keys      |
| 1. Prepublish B | A           | A             | A + B + any other required grace keys |
| 2. Activate B   | B           | B             | B + A + any other required grace keys |
| 3. Retire A     | B           | B             | B + any other keys still required     |

### Phase 0 — Generate B

Run this from the repository on a trusted offline machine with dependencies
already installed. Use a new key ID for your environment. The example ID below
is a placeholder; do not reuse it for later rotations.

```sh
umask 077
rotation_root="$(mktemp -d)"
rotation_dir="$rotation_root/key-b"

pnpm run keys:generate -- \
  "$rotation_dir" \
  "jump-prod-2026-10-b"
```

The generator creates the new directory itself. The private parent directory
keeps the output outside the repository.

| File                    | Contents                                             | Handling                                        |
| ----------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| `private.pem`           | B's private key in PKCS#8 PEM format                 | Secret                                          |
| `public-jwks.json`      | B's public JWK only                                  | Input for the merge in Phase 1                  |
| `wrangler-secrets.json` | B's private PEM under `UMAXICA_JUMP_PRIVATE_KEY_PEM` | Secret; not a complete deployment configuration |

Check the generator's result: `result=ok`, `algorithm=ES384`, `curve=P-384`,
`pair_check_ok=true`, and the intended `kid`. Check the key ID against your key
inventory; the generator does not know which IDs production has used before.

No production values change in this phase.

### Phase 1 — Publish B's public key first

1. Take the current approved public JWKS for this environment.
2. Add B's public JWK from the generated file to its `keys` array.
   Keep A and every other public key whose grace period has not ended.
3. Check that the merged set has unique key IDs, valid public keys, and no private fields.
4. Prepare and deploy one consistent version with A's private key, active ID A,
   and the merged public JWKS.
5. Fetch `/.well-known/jwks.json` from the configured production origin.
   Confirm that it contains A and B, plus any other expected keys.
6. Use an approved test flow to confirm that new RTs still have header `kid=A`
   and that receivers still accept them.
7. Wait for the agreed prepublication period. Confirm that every receiver can
   obtain B's public key before starting Phase 2.

**Do not replace the current JWKS with the generated `public-jwks.json`.** That
file contains only B. Replacing the set would remove A too early.

Publishing B adds it to the receiver's trusted verification set. The label
“prepublished” does not prevent a receiver from accepting a valid B signature.
Protect B's private key from the moment it is generated.

### Phase 2 — Make B the active signer

1. Prepare one Worker version with all three values:

   ```text
   UMAXICA_JUMP_PRIVATE_KEY_PEM = B private PEM
   UMAXICA_JUMP_PRIVATE_KEY_KID = B key ID
   UMAXICA_JUMP_PUBLIC_JWKS     = B public + A public + other required keys
   ```

2. Deploy that version as one consistent change. Do not edit these live values
   one at a time. Confirm the deployed version ID and traffic assignment.
3. Confirm that the Worker's private/public pair check passes.
4. Obtain a new RT through an approved test flow. Check that its header has
   `alg=ES384` and `kid=B`. Confirm that each receiver verifies and accepts a B token.
   Reading the header alone is not signature verification.
5. Confirm that the public JWKS still contains A and B. During the overlap,
   confirm that an otherwise valid, unexpired A token remains verifiable.
6. Record the last possible time that A could have signed a token. Include old
   instances, in-flight requests, deployment propagation, and any recovery action.

If any check fails, stop the normal rotation. Use the tested recovery version
with B and the required public keys. Do not remove A's public key or destroy A's
private key until their separate conditions below are met.

### Phase 3 — Remove A's public key after grace

1. Confirm that no active deployment or recovery process can still sign with A.
2. Confirm that the full agreed grace period has passed since the last possible
   A issuance. If that time or any timing bound is unknown, keep A's public key.
3. Prepare and deploy a consistent version with B's private key, active ID B,
   and a public JWKS that removes only A. Keep other keys that are still required.
4. Confirm that the production JWKS contains B and no longer contains A.
5. Confirm that new B tokens are accepted by every receiver. Confirm that old
   A tokens are rejected as expired under the receiver contract.

Removing A from the published JWKS does not immediately erase it from caches.
Normal retirement relies on correct token expiry checks as well as the agreed
waiting period. Emergency revocation has different completion checks below.

## How long to wait

There are two separate waiting periods:

| Period              | Purpose                                                         | Inputs                                                                                                         |
| ------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Before activating B | Let receivers obtain B's public key                             | Deployment propagation, receiver cache and refresh behavior, CDN stale behavior, safety margin                 |
| Before removing A   | Allow previously issued A tokens to finish their valid lifetime | Last possible A issuance, maximum RT lifetime, receiver clock tolerance, cache and stale bounds, safety margin |

Jump currently issues outbound RTs with a 30-second lifetime. The current
receiver contract allows 5 seconds of clock tolerance. **This does not establish
a safe 35-second rotation window.** Jump's cache for incoming issuer keys does
not tell you how receivers cache Jump's public keys.

Use this conservative retirement rule:

```text
Earliest A public-key removal =
  last possible A signing time
  + maximum outbound RT lifetime (currently 30 seconds)
  + receiver clock tolerance (currently 5 seconds)
  + receiver JWKS cache/refresh bound
  + CDN stale allowance, if present
  + operational safety margin
```

Include deployment propagation and any local key-material cache in the estimate
of the last possible A signing time. If you start from the deployment start time,
add those bounds explicitly. If A signs again, calculate the window again.
Record actual bounds for every receiver; use the longest applicable window.
Unknown values are a reason to stop retirement, not a reason to assume zero.

## When to destroy A's private key

At steady state, only the active Jump private signing key may remain available
to the Worker. Keeping A's public key during grace does not require A's private key.

Destroy the old private key promptly once all of these conditions are met:

- B's active deployment has passed verification.
- Receivers have verified tokens signed by B.
- The tested recovery version can use B.
- Operators have confirmed that recovery will not return to A signing.

Do not destroy A before these conditions are met. Any temporary retained copy
must stay in approved secret storage with an owner and a removal deadline.

Account for local PEM files, secret JSON files, secret-backend versions, backups,
and old deployable Worker versions. Use the approved deletion and retention
process for each storage system. Deleting a local file does not prove that every
copy is gone. Record any provider retention limits and prevent old versions from
being redeployed with A. Do not retain A simply because its public key is in the JWKS.

## Deployment and recovery rules

A deployment must keep the private PEM, active key ID, and public JWKS consistent.
“Atomic” here means a consistent version; it does not mean every location changes
at the same instant. Account for propagation in the timing gates.

Worker secrets and external Secrets Store bindings have different lifecycles.
An immutable Worker version can still refer to an externally mutable secret.
Verify the actual backend's version behavior before rotation. The generated
`wrangler-secrets.json` contains only the private PEM; configure the active ID
and the merged JWKS as part of the same reviewed version.

Recovery after B activation should restore the required code behavior while
continuing to use B. Prepare that version before activation. An arbitrary
previous Worker version may restore A or remove public keys that receivers still
need. It may also remove required security fixes or the outbound `rpl=reuse`
contract. Do not use it as a recovery target without verification.

See Cloudflare's [Worker secrets documentation](https://developers.cloudflare.com/workers/configuration/secrets/)
and [rollback documentation](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
for platform behavior. Follow the repository's [recovery requirements](rollback-recovery.md)
and [origin cutover procedure](origin-cutover.md) for release-specific checks.

## Emergency: a private key may be compromised

Use this procedure if A's private key may have leaked. **Do not give A a normal
grace period.** An attacker with A's private key can create new signed tokens as
long as a receiver still trusts A.

1. **Contain the incident.** Stop affected issuance. Ask every receiver owner to
   reject A's key ID for the affected Jump issuer, even if a cached JWKS contains A.
   If a receiver cannot enforce this, block affected token acceptance until it
   can. Preserve incident evidence without copying private material or live tokens.
2. **Generate B in a trusted environment.** Use a new key ID and confirm the pair
   self-check. If the normal generation environment may be compromised, use a clean one.
3. **Prepare replacement trust.** Arrange for receivers to obtain B's public key.
   Keep the rejection of A in force. Do not wait for normal grace to expire.
4. **Activate B and remove A.** Deploy a consistent version with B's private key,
   active ID B, and a public JWKS that excludes A. Keep only other trusted keys.
5. **Refresh caches.** Purge the affected JWKS URL from any configured CDN cache
   and invalidate or refresh each receiver's JWKS cache. A CDN purge does not
   clear an application's in-memory cache.
6. **Remove A's private material.** Disable access to retained copies and follow
   the incident deletion process. Prevent older deployments from restoring A.
   Deletion cannot invalidate a copy already stolen by an attacker.
7. **Verify both outcomes.** Confirm that B tokens are accepted and A tokens are
   rejected by every receiver. Test A rejection with a controlled, otherwise
   valid token and a cache that still contains A, so rejection is not merely due
   to expiry or a cache miss. Use an isolated test fixture where needed; do not
   create fresh production tokens with the compromised key.
8. **Record completion.** Record each receiver's revocation result, cache actions,
   replacement deployment ID, and remaining incident follow-up. Keep A's key ID
   revoked so a stale cache or recovery action cannot restore trust.

**Removing A from the JWKS alone does not complete emergency revocation.** The
receiver owns revocation of Jump signing keys. This runbook does not add that
state to Hono or implement receiver changes. Jump's rejection of incoming issuer
keys is a separate control and does not revoke Jump's outbound keys at receivers.
Never recover by using a compromised key.

## Operation record

After an actual rotation or incident, add a short Markdown record under
`evidence/YYYY-MM-DD-key-rotation.md` (use a distinct topic for another operation
on the same day). Record:

- Environment, operator, date, and old/new key IDs.
- Actual version IDs and non-secret configuration or secret-version references.
- Results of each phase's checks, including receiver verification.
- Timing bounds, the last possible A issuance, and the earliest retirement time.
- The tested B recovery version and old private-key disposal status.
- For an emergency, each receiver's rejection result and cache actions.
- Any incomplete check, its reason, and the next responsible owner.

Record only work that was performed. Never include private keys, secret bundle
contents, live tokens, or raw request logs. A documentation update or a local
test pass is not evidence of production rotation or revocation.
