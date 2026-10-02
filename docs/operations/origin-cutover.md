# Origin cutover contract

`UMAXICA_JUMP_ORIGIN` is required protocol identity configuration. The current
production value is `https://jump.umaxica.net`; it is not a code constant or
fallback. DNS labels must be valid; special-use address ranges and local/special
DNS suffixes are denied. Explicit .example fixture identities remain permitted
for configured test injection. This is syntactic policy, not DNS reachability proof.
Missing, empty or malformed configuration fails closed. Exact HTTPS
origin serialization is required: no userinfo, path beyond `/`, query, fragment,
explicit port, localhost, private or special host. Configuration is never derived
from forwarded headers. Requests must have the configured origin; rejection does
not reveal that origin. Inbound aud, outbound iss, self-link rejection, app cache
identity, about, robots and sitemap use the same configured value.

## Provider cutover with stable protocol origin

Keep `https://jump.umaxica.net` while steering traffic from Cloudflare to a future
provider. This is not a protocol identity change. Independently verify adapter
contracts, TLS/routes and operational security before traffic steering. Prefer
separate private signing keys per provider. Prepublish required public keys in
the same Jump JWKS throughout overlap and retain verification until all relevant
tokens/caches have expired. No second provider or Fastly executable path is
implemented by this change.

## Protocol-identity cutover

Changing `https://jump.umaxica.net` to `https://jump-next.example` is a protocol
migration, not merely a DNS change. Coordinate issuer aud, receiver trusted iss,
receiver Jump JWKS URL, Jump outbound iss and self-origin contract. A safe migration
may require a window where receivers explicitly trust OLD and NEW identities
and their separately pinned JWKS URLs. Issuers must issue the audience matching
the requested identity. Single-origin Jump never silently accepts both.

Multi-origin trust is **future protocol work**, not implemented here. Coordinate
an explicit recovery window before switching: reverting configuration alone does
not undo receiver or issuer trust changes. Do not broaden graph/allowlists for
cutover. See [receiver contract](../receiver-contract.md), [key lifecycle](key-rotation.md)
and [recovery](rollback-recovery.md). Origin cutover operational readiness remains
UNVERIFIED; ROLLOUT_STATUS = BLOCKED_FOR_ROLLOUT.

Special-use references: [IANA IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry/), [IANA IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry/), [IANA domains](https://www.iana.org/assignments/special-use-domain-names/).
