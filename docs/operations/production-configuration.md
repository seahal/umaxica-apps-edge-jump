# Production configuration and origin changes

Cloudflare production is the sole deployed target. Canonical settings:

| Name                         | Contract                                            |
| ---------------------------- | --------------------------------------------------- |
| UMAXICA_JUMP_ORIGIN          | Required canonical HTTPS origin, no trailing slash  |
| UMAXICA_JUMP_PRIVATE_KEY_PEM | One active ES384 PKCS#8 private secret              |
| UMAXICA_JUMP_PRIVATE_KEY_KID | One opaque active kid, ≤128 characters              |
| UMAXICA_JUMP_PUBLIC_JWKS     | Explicit valid public set containing active kid     |
| JUMP_RATE_LIMITER            | Callable provider binding, 600/60s, namespace520900 |
| ASSETS                       | Existing Worker-first static binding                |

JUMP_PRIVATE_KEY_PEM/KID and UMAXICA_JUMP_PUBLIC_KEYSET are removed aliases:
alias-only settings fail503. Verify deployed canonical references without obtaining
or printing private values. Checked-in kid/JWK/origin values were not rotated.
Live presence is unverified and is a deployment gate, not inferred from config.

UMAXICA_JUMP_ORIGIN has no default. Require complete equality to URL.origin and
HTTPS, no userinfo/path/query/fragment/nonstandard port/whitespace/control/trailing
dot, localhost/single-label/private/link-local/loopback/metadata host. Identity may
not collide with any application or external allowlisted origin. Request origin
must match; forwarded request headers cannot change it. See protocol and plan
for status precedence and the alternate canonical identity regression.

## Switching provider while retaining public identity

A future adapter must pass the same contracts before any traffic steering.
Retaining the public origin avoids changing JWT identity, but requires separately
verified DNS/routes/TLS, bindings, key bundle and platform security/log behavior.
Portable core is not an already deployed backup. No DNS or provider changes were
performed in this work.

## Changing public origin

Treat this as a coordinated protocol identity migration. Prepare issuer aud,
receiver trust/iss/JWKS references, DNS/TLS/routes and all deployment controls.
Validate a consistent bundle and request origin. Configuration alone does not
change external trust, DNS or TLS. Do not register extra production domains to
make a test pass; alternate-origin tests inject configuration locally.

## Rate limiter and errors

Missing/noncallable binding, absent/invalid CF-Connecting-IP or nonobject/nonboolean
success are503 service_unavailable. Exactly success=true continues, false429.
Only exception/rejection from an otherwise valid binding call warns and continues
all JWT/URL/graph/key checks. No IP values are logged; IP is coarse abuse control,
not authentication, authorization or replay prevention. Shared-IP collateral and
fail-open load are accepted residual risks. Deadline504 never continues. The
Cloudflare native binding configured in `wrangler.jsonc` `ratelimits` is the only
rate-limit mechanism; see [deployment verification](deployment-verification.md#rate-limiting).

Initialization, ASSETS, secret and Hono failures get final common headers. Bad
requests400; configuration503; unexpected exceptions500; entry deadline1000ms504.
Issuer network/5xx/429503 temporarily_unavailable differs from bad documents400.
Health200 proves only responsiveness.

## Release gate

Verify real Worker version ID, canonical secret/config references, all13 issuer
JWKS reachability and receiver reuse/URL/transaction contract, DNS/routes/Access/
WAF/TLS and final response/log behavior. Check query redaction (including in
invocation logs and traces), enabled native persistence and 100% sampling. Protocol
values must stay in queries, never pathnames. Arbitrary pathname and generated
metadata persistence is accepted; application logs still prohibit raw values. Do not
equate Git SHA with deployed version. A compatible recovery artifact is mandatory;
see compatibility matrix. Until verified: BLOCKED_FOR_ROLLOUT.

## Additional 0.2 hardening contract

Use [deployment verification](deployment-verification.md) (health, JWKS, signed RT smoke), [origin cutover](origin-cutover.md) for identity changes and [rollback recovery](rollback-recovery.md) for recovery. Require the CI worker-runtime job in release/branch protection; repository YAML alone does not configure external branch protection. rollback-compatible immutable artifact: NOT YET VERIFIED. ROLLOUT_STATUS = BLOCKED_FOR_ROLLOUT.

## 0.3 release blockers

Required GitHub checks are `quality`, `unit` (coverage), `worker-runtime`, `e2e`,
`secret-scan` and `cloudflare-dry-run`. The `dependencies` audit job must also pass.
An administrator must enforce the checks in branch protection/rulesets; workflow
presence does not enforce a merge gate. No remote settings were changed or verified.
`GITHUB_RELEASE_GATE = BLOCKED_UNTIL_ENFORCED`.

The reported Rails Rack nested-query Hash comparison does not implement the
normative WHATWG URL/URLSearchParams receiver comparison. This remains an external
integration blocker. Receivers must accept Jump outbound structural TTL of
30 seconds; a 10-second maximum is incompatible. Do not negotiate down Hono TTL.
See [receiver contract](../receiver-contract.md) and [compatibility](../compatibility.md).

`ROLLBACK_ARTIFACT = NOT_VERIFIED`. A real immutable Worker version ID and its
code/config/secret references must meet the recovery contract. Local tree, Git SHA
and CI build ID do not satisfy this gate. Production bindings and traffic state
remain unverified. `ROLLOUT_STATUS = BLOCKED_FOR_ROLLOUT`.
