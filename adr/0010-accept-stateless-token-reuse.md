# Accept token reuse without persistent storage

Date: 2026-11-14
Status: accepted by the owner

## Decision

Persistent storage is unavailable for this deployment. Keep Jump stateless and
accept replay of valid inbound and outbound tokens within their validity windows.
No replay store, consume API, one-time jti requirement or storage binding is added.
This supplements the accepted reuse decision in ADR 0002; it does not supersede
the protocol or weaken signature, issuer, audience, destination or time checks.

## Consequences

Someone who obtains an unexpired token can reuse it. Each accepted inbound
evaluation creates a fresh outbound jti and a new 30-second outbound lifetime;
therefore consuming an outbound jti once would not deduplicate inbound replay.
Clock tolerance also applies to validity checks. These tokens prove an approved
origin transition, not a unique user action or a newly authenticated session.
Receivers must independently enforce their operation-specific authentication,
authorization, CSRF and OAuth state/nonce/PKCE checks. Single execution cannot be
promised by this stateless protocol; operations requiring it need a separate
receiver-owned design and must not rely on Jump's jti as that guarantee.

URL exposure is a separate residual risk. Both input and output rt travel in
URLs, and JWS payloads, including destination query values, are readable without
a key. HTTPS, no-store, no-referrer and log redaction reduce exposure but do not
erase history, copied URLs or endpoint logs. This decision accepts reuse; it
does not declare sensitive URL transport compliant with ASVS 5.0.0-14.2.1.
See the security contract and receiver exposure guidance for mitigations.
