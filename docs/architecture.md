# Architecture

`src/cloudflare.ts` owns provider bindings, trusted transport IP, static assets,
entry request ID, outer deadline and final error/headers. Hono routes in
`src/index.ts` inject explicit registry, JWKS source, signing dependency and
validated identity. Core uses Web Standard URL, Request, Response, AbortSignal
and Web Crypto through jose. No destination safety fetch is performed.

Flow: configuration → Request origin binding → method/query/path → limiter →
assets or Hono → compact JWT/header/issuer → pinned JWKS → ES384 verification →
claims → URL → exact policy → cushion or new signed RT → common headers.
The [plan](../plans/jump-0.3-hardening.md) defines status precedence.

Cloudflare production is the sole implemented provider. Portable core permits a
future adapter; no redundancy or active-active delivery is claimed. Historical
Fastly and Leap/Rails implementation descriptions are superseded by ADR 0005.

No DB/KV/DO/R2/Queue/Cache API authentication or replay state is used. All
caches are isolate-local `Map`s and are optimizations, never a correctness or
security boundary: a cold isolate, an eviction or routing to another instance
reaches the same decision at the cost of extra work.

The Hono app and its issuer `JwksCache` live in one module-scope entry per
isolate. It is not keyed on the `env` object, whose reference identity across
requests is not a platform contract. Every request recomputes the canonical
service origin and Worker version and reuses the entry only when both match;
otherwise a fresh app replaces it. The entry holds the static registry and
public issuer keysets only. Nothing request-scoped and no signing secret is
captured: the signer and published JWKS are resolved from each request's `env`.

Issuer JWKS state is one entry per registry issuer (at most 13), created only
for an issuer taken from the static registry; no request value, in particular no
`kid`, is ever used as a key. Each entry holds the imported keyset and its
expiry (30 seconds), an outage deadline (`jwks_unavailable`: network failure,
5xx, 429; 30 seconds), an unusable-document deadline (`jwks_bad_gateway`; 10
seconds), the next permitted forced refresh (10-second cooldown) and at most one
in-flight fetch shared by concurrent requests. There is no unknown-`kid`
negative cache: an unknown `kid` triggers at most one forced refresh per issuer
per cooldown, and inside the cooldown it is answered from the current keyset.
Per issuer, fetches are therefore bounded by one per TTL plus one per cooldown,
whatever the number of distinct `kid` values. Revoked kids are rejected before
any cache or fetch. Normal rotation does not rely on forced refresh: a key
prepublished more than 30 seconds before signing starts is already cached.

A keyset inside its TTL keeps verifying requests that need no refresh while an
outage is negative cached. A request that depends on a refresh — unknown kid, or
a signature that failed against the warm key — is a dependency failure during
the outage (503 `temporarily_unavailable`); the warm key is never used to turn
it into a 400. There is no stale-key fallback: past the TTL the keyset is
ignored and the outage answers 503 until the negative entry expires and the
issuer is asked again. An invalid 200 document is not an outage and is never
cached; a refresh-dependent request answers 400 and a warm keyset keeps serving
requests that need no refresh. One aborted shared load can fail its waiters
closed; it is cleared so a later request can retry.

Signing material is cached per binding bundle (`env` reference), deployment
revision and active kid for 300 seconds. It stays `env`-keyed on purpose: it is
derived from secrets, so it is not shared across differing `env` objects; an
unstable reference only costs a re-import. Every loaded bundle imports all public keys, imports private
PKCS#8 with extractable:false, and probe-verifies the active pair. A failed
load is not cached. No runtime
private-key export or derivation exists. See the immutable bundle runbook.

## Additional 0.2 hardening contract

There is no readiness endpoint. Hono /health* is liveness only; /.well-known/jwks.json publishes only the pair-checked signing bundle; a valid signed RT smoke proves the redirect path. See [deployment verification](operations/deployment-verification.md). No persistent replay state, new provider or receiver logic is added.
