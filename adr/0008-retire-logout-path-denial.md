# Retire the logout-specific path denial

Date: 2026-11-12
Status: accepted by the owner

The owner plans to rebuild logout and requested removal of the `/sign/out`
route denial. No route-specific path denials are currently configured. Former
logout paths, including encoded ordinary characters and format suffixes, follow
the normal URL syntax validation and issuer destination allowlist.

Keep the source-to-self prohibition: a source origin must not redirect to itself,
even if accidentally present in its own allowlist. Registry construction and
runtime destination policy already enforce this. Other allowed hosts under the
same parent domain remain eligible. This decision adds no domain-wide denial
and does not change the existing cross-TLD policy or approved origin graph.

This supersedes the logout-specific denial described in ADR 0006 and the dated
path-boundary design. General path syntax and transfer-query checks remain.
