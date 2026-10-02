# Schema 1 strictness migration

0.2 requires rpl reuse while retaining schema1. Update issuer packet and receiver
contract support in their separate repositories before rollout. Do not relax
Jump to accept missing rpl. Verify all20 edges with distinct issuer keys and real
JWKS endpoints. See [compatibility matrix](../compatibility.md).

Prepare and test a compatible recovery artifact. Old0.1 continuously emits output
without rpl: a TTL wait cannot cure post-rollback rejection. Keep new-only issuer
issuance aligned with the recovery graph or explicitly stop it. Preserve revoked
kids and prohibited edges. Until these external gates pass, BLOCKED_FOR_ROLLOUT.
