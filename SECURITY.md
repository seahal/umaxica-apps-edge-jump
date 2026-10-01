# Security Policy

## Reporting a Vulnerability

Use GitHub private vulnerability reporting for this repository:

https://github.com/seahal/umaxica-apps-edge-jump/security/advisories/new

The repository has private vulnerability reporting enabled. That is the
official channel. Do not open a public issue, pull request, or discussion
with exploit details, tokens, private keys, or proof-of-concept payloads.

If you cannot use GitHub advisories, open a public issue that states only
that you need a private contact, with no technical details, and wait for a
maintainer to move the conversation to an advisory.

## Scope

In scope:

- The Jump gateway at `https://jump.umaxica.net`
- JWT verification, destination policy, public errors, and security headers
- The Cloudflare Worker configuration in this repository
- Logging and observability settings that can persist `rt` or User-Agent

Out of scope unless they are caused by Jump:

- Issuer applications (`auth.*`, `www.*`, and other Umaxica apps)
- Receiving-app replay, CSRF, and session handling
- The experimental Fastly entrypoint, which is not a production path
- The non-production Rails implementation at `leap.umaxica.net`, which is
  handled in the Rails application's repository
- Cloudflare account IAM, zone-wide rules on other hostnames, and
  `/cdn-cgi/` platform endpoints

## What to include

- Jump URL or route involved (without a live `rt` value)
- Approximate time (UTC) and Cloudflare Ray ID if you have one
- Observed status, `X-Jump-Error` public class, and response headers
- Why you believe the behavior violates the documented contract
- Your environment (browser or `curl`)

Do not send production private keys, captured session cookies from other
apps, or full JWTs unless a maintainer asks for a redacted sample.

## Supported versions

Only the currently deployed Worker on `jump.umaxica.net` and the default
branch of this repository receive security updates.
