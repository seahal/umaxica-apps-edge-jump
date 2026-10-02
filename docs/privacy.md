# Privacy

`rt` JWTs and destination URLs are URL-visible. Signing provides authenticity,
not confidentiality. Browser history, screenshots, bookmarks, shared links and
infrastructure can expose their contents.

## Forbidden data

Do not put passwords, private keys, long-lived credentials, access/refresh
tokens, session credentials or unnecessary personal information in redirect
URLs or JWT claims. Minimize claims and destination query values.

OAuth authorization code, state, nonce and PKCE-related routing/state values
may be necessary for a receiver flow. Treat them as **URL-visible, short-lived,
security-sensitive protocol values**, not as non-secret data. This is not
permission to transfer a PKCE verifier or other credential unnecessarily.
Receivers independently verify state, nonce, PKCE and authorization-code use.

## Transport and observability

Transport `rt` only as a query parameter. Never put `rt`, JWTs or other protocol
values in a pathname. Query-string redaction removes request queries from
Cloudflare platform logs and traces; it does not protect pathname values or
custom log messages.

Native invocation logs and traces are enabled and persisted at 100% sampling.
Arbitrary pathnames and Cloudflare-generated request metadata may persist there;
this is an accepted operational risk. The application logger separately records
only allowlisted public paths and redacts arbitrary paths. It must never record
raw protocol values, query strings, JWTs, arbitrary URLs, Authorization, Cookie,
private keys, JWKS bodies or untrusted exception messages.

Only native Cloudflare retention is used. No external archive or retention beyond
the native service is implemented or guaranteed. See [logging](logging.md).
Referrer policy and log controls reduce leakage but cannot erase URL exposure.
