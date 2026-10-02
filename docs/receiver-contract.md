# Receiver obligations (normative)

Jump authorizes only a transition between approved origins instructed by a
trusted issuer within token lifetime. It does not authorize authentication
completion, identity, authorization, CSRF approval, state mutation or one-time
transaction execution. Origin policy does not certify every endpoint at an origin.

The receiver MUST verify the Jump ES384 signature against its trusted Jump JWKS,
exact configured iss, string aud equal to its origin, schema 1, sub jump-redirect,
rpl reuse, finite NumericDates, expiry/5-second tolerance, src and the signed URL.
The receiver must accept Jump outbound structural TTL of 30 seconds (`exp - iat`);
clock tolerance applies only to current-time comparisons. A receiver maximum of
10 seconds is incompatible. Jump does not follow a receiver-local TTL setting.
Compare the real request URL after removing exactly one new rt query parameter
with the signed url using WHATWG URL and URLSearchParams serialization. Reject
duplicate/reserved rt or mismatch; do not apply first/last-wins repair. Paths,
OAuth redirect_uri/state/nonce/code and meaningful queries must survive comparison.
The machine-readable [fixture](../test/fixtures/receiver-contract.json) states the
handshake acceptance contract, without implementing a receiver.

After signature verification, independently perform operation-specific authn,
authz, CSRF, state, nonce, PKCE, authorization-code and transaction-state checks.
A fresh Jump jti from repeated evaluation must not permit double execution of
the same receiver-owned transaction. No Jump consumption API or src_jti exists.

If redirecting again, independently validate next/return_to/redirect_uri and
other destinations. Being included in a signed URL is insufficient authorization
for a downstream redirect. Receiver trust, revocation, idempotency and clock/cache
policies are external integration gates; this repository changes no Rails or
TanStack implementation and does not emulate them.

## Additional 0.2 hardening contract

Operational cross-references: [origin cutover](operations/origin-cutover.md), [key lifecycle](operations/key-rotation.md), [rollback recovery](operations/rollback-recovery.md). Emergency receiver revocation is independent of cached Jump JWKS and must reject compromised keys. No receiver implementation changes are part of this hardening.

## URL comparison boundaries and external blocker

The fixture's `url_cases` records duplicate `rt`, `rt[]`, nested `rt[...]`,
duplicate state/code, query ordering and percent encoding. Exactly one literal
decoded `rt` key is required; array/nested keys must not be collapsed by a Hash
parser. Duplicate single-valued redirect_uri/state/nonce/code/next/return_to
parameters are rejected. Removing returned `rt` and serializing URLSearchParams
preserves query order; reordered pairs do not match a differently ordered signed
URL. `%20` and `+` for spaces, and percent-encoded equivalent keys/values, may
serialize identically; `%2B` is a literal plus and is not a space.

The reported Rails feature uses Rack nested-query Hash semantics, which differs
from this contract. Hono's contract is not weakened to match it. Rails must pass
these boundaries in its own runtime and real receiver integration tests before
rollout. Fixture evaluation in this repository is not Rails acceptance or Rails
runtime E2E. Rails code was not inspected or modified by this implementation task.
