# Decisions

## Why JWT In Query String?

The redirect entry point must work across FQDNs without cookies or sessions. A URL token is portable and explicit. It is not confidential, so claims must not contain secrets.

## Why No Cookies?

Cookies create session semantics and cross-site policy concerns. Jump is stateless and ignores cookies.

## Why Stateless?

Stateless validation works well across active-active edge runtimes and avoids database availability in the redirect path.

## Why Fastly + Cloudflare Active-Active?

Two edge providers reduce dependence on one runtime and allow traffic steering during incidents.

## Why Hono Only?

Hono provides small Web Standard routing primitives without requiring a frontend or build framework.

## Why No Vite?

Jump is an edge HTTP service, not a frontend app. The initial implementation should avoid deploy and bundler coupling.

## Why P-384?

P-384 keys are small, fast, and map cleanly to EC JWKs with `alg: ES384`.

## Why Jump Does Not Detect Replay?

Jump's schema-1 token communicates a redirect decision only and may be reused until expiry. It does not establish authentication, a session, authorization, CSRF approval, or permission for a side effect. Jump signs a `jti` that identifies each output JWT but does not copy the input `jti`, require receiver-side consumption storage, or log the identifier. A future consequential-action protocol requires a separately reviewed major schema change.

## Why No Opaque Tokens?

Opaque tokens require shared server-side storage or introspection. That would conflict with the stateless edge design.

## Why No SDK Abstraction Initially?

Copy-paste examples keep the protocol visible. Official libraries can come later after the claim model and operational practices stabilize.

## Why Direct Redirects Are Forbidden?

External direct redirects make phishing and OpenRedirect failures harder to see. Cushion pages make the cross-site transition explicit.

## Why Jump Acts As A Trust Broker?

Jump centralizes redirect policy at an FQDN boundary so each issuer does not reimplement URL validation and external redirect behavior differently.

## Why Is JWKS Outage 503?

A token that is malformed, unsigned, expired, or aimed at a disallowed
destination is the client's problem: `invalid_request` / 400. A registered
issuer whose JWKS endpoint times out, fails to connect, or returns 5xx/429 is
Jump's dependency: `temporarily_unavailable` / 503. Callers can retry the
latter without being told which issuer, which URL, or which exception. An
unusable JWKS document (`jwks_bad_gateway`) stays 400 because retry will not
help. Distinguishing the two public classes during an issuer outage is an
accepted trade-off against a registration oracle.

## Why Is HSTS 12 Months?

Production `jump.umaxica.net` serves
`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.
That 12-month max-age is the intended policy. Worker source and tests that
required `63072000` were a stale contract and follow production, not the
other way around. `includeSubDomains` and `preload` are unchanged.

## Why Forbid A Redirect To The Same Origin?

A destination equal to its source spends a signature verification and a round
trip to leave the user where they already were, and it is the one-hop form of a
redirect loop. Jump refuses it structurally — no issuer lists its own origin,
and the service origin itself is rejected during URL normalization. See
[ADR 0003](../adr/0003-no-self-referential-redirects.md).
