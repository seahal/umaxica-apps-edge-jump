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

No DB/KV/DO/R2/Queue/Cache API authentication or replay state is used. The issuer
cache is limited by the explicit 13-issuer registry; unknown-kid/failure entries
are capped at 1024. JWKS TTL is 30 seconds, forced refresh cooldown 10 seconds,
and concurrent fetches for an issuer are coalesced. Revoked kids are checked
before warm cache. Separate binding bundle objects have separate caches; sharing
an object and changing a same-kid key live is unsupported. Eviction/cold start
only adds verification work. One aborted shared load can fail its waiters closed;
it is cleared so a later request can retry.

Signing material is cached per binding bundle, deployment revision and active
kid for 300 seconds. Every loaded bundle imports all public keys, imports private
PKCS#8 with extractable:false, and probe-verifies the active pair. A failed
load is not cached. No runtime
private-key export or derivation exists. See the immutable bundle runbook.

## Additional 0.2 hardening contract

There is no readiness endpoint. Hono /health* is liveness only; /.well-known/jwks.json publishes only the pair-checked signing bundle; a valid signed RT smoke proves the redirect path. See [deployment verification](operations/deployment-verification.md). No persistent replay state, new provider or receiver logic is added.
