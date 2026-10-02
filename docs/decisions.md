# Current decisions

[ADR0005](../adr/0005-production-jump-0.2.md) defines production-only Cloudflare,
portable explicit core, 13/20 graph, required reuse and explicit public bundle.
No replay state or receiver emulator is added. JWT schema and service release
versions are separate. Required service identity remains configurable.

JWT query transport supports cross-FQDN instructions without cookies; it is not
confidential storage. Issuer exact allowlists and external confirmation prevent
arbitrary direct redirects. Production external capabilities stay disabled.

Limiter call exceptions are the sole approved fail-open exception. Configuration,
crypto, URL, graph and key pair failures stay closed. A 503 issuer dependency
outage is distinguished from unusable-document400, with coarse public errors.

HSTS retains12 months. Static ASSETS remains behind Worker-first hygiene.
Receiver authentication, CSRF, transaction uniqueness and downstream redirects
remain independently owned. Historical decisions are retained in ADR/evidence;
current release/recovery requirements are in [compatibility](compatibility.md).
