# Rollback-compatible recovery

Rollback target != arbitrary previous version. After receivers require 0.2
`rpl=reuse`, pre-0.2 issuance without rpl can fail continuously, including NEW
RTs minted after rollback. Waiting for the old TTL does not repair this.

A rollback-compatible recovery artifact must retain:

- schema 1 and outbound exact string `rpl=reuse`;
- current approved 13 canonical nodes / exactly 20 directed edges, with Edit
  excluded and production external redirects disabled;
- strict configurable origin validation and matching request origin;
- explicit configured public JWKS with active public key and pair check;
- no private-to-public fallback and non-extractable private import;
- expected limiter semantics: missing binding/IP fail closed, false yields 429,
  only a valid binding call's runtime exception warns and proceeds with all checks;
- current coarse public-error boundary, headers and schema-1 inbound TTL ≤30 seconds;
- native invocation logs and traces enabled/persisted, 100% sampling, query redaction;
- current revocations and receiver responsibility contract.

Record a real immutable Worker version ID, validated code/config/secret references,
receiver compatibility and real workerd validation. The uncommitted working tree
is not such an artifact. **rollback-compatible immutable artifact: NOT YET VERIFIED**.
ROLLOUT_STATUS = BLOCKED_FOR_ROLLOUT until this and all other release gates pass.

## Graph, key and identity recovery

An earlier graph can reject newly enabled issuers/edges continuously. Use the
current approved graph; do not restore prohibited edges for availability.

Before activating B, prepare and test a recovery version that uses B's private
key, active kid B, and the required public JWKS. After activation, recover code
behavior while keeping B as the signer. Retain A's public key until the measured
grace period ends; retaining that public key does not require A's private key.
Do not use an arbitrary previous A-signing version as the recovery target.
Destroy A's private key only after the lifecycle runbook's disposal conditions
are met. Never restore a compromised key or revoked trust.

Atomic immutable versions must contain consistent private/kid/JWKS bundles;
external mutable secret references must also have verified version semantics.
Record the real tested B recovery version ID before rollout.

Identity rollback must coordinate issuer aud and receiver trusted iss/JWKS URL
with request routing; restoring an origin variable alone is insufficient. See
[origin cutover](origin-cutover.md), [key lifecycle](key-rotation.md),
[compatibility](../compatibility.md) and [receiver contract](../receiver-contract.md).
