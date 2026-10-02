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
- current coarse public-error boundary and headers;
- current revocations and receiver responsibility contract.

Record a real immutable Worker version ID, validated code/config/secret references,
receiver compatibility and real workerd validation. The uncommitted working tree
is not such an artifact. **rollback-compatible immutable artifact: NOT YET VERIFIED**.
ROLLOUT_STATUS = BLOCKED_FOR_ROLLOUT until this and all other release gates pass.

## Graph, key and identity recovery

An earlier graph can reject newly enabled issuers/edges continuously. Use the
current approved graph; do not restore prohibited edges for availability.

After activating B, an authorized return to uncompromised A requires signer=A,
active kid=A, JWKS=[A,B]. Receivers must retain B verification for tokens already
issued by B, until its last possible issuance plus maximum TTL, clock tolerance,
propagation and receiver/CDN cache bounds. Never revert to A-only while valid B
tokens may exist. Never roll back to a compromised private key or restore revoked
trust. Atomic immutable versions must contain consistent private/kid/JWKS bundles;
external mutable secret references must also have verified version semantics.

Identity rollback must coordinate issuer aud and receiver trusted iss/JWKS URL
with request routing; restoring an origin variable alone is insufficient. See
[origin cutover](origin-cutover.md), [key lifecycle](key-rotation.md),
[compatibility](../compatibility.md) and [receiver contract](../receiver-contract.md).
