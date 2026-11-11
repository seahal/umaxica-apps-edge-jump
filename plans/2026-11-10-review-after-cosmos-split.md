# Review Jump After the Cosmos Split (2026-11-10)

Status: open; recorded from a discussion in the Cosmos repositories. No code has changed.

## Why

- The Rails application behind Jump was split into four repositories (`umaxica-apps-cosmos-access`,
  `-governance`, `-press`, `-sphere`). Host ownership moved: `auth` and `visa` belong to Access;
  `www` (Base) and `tech` to Governance; `www-jp` (Warp), Core and Palm to Sphere; `edit` to Press.
  Each now has its own Cloudflare Tunnel.
- The `.com` surfaces are now almost unused ("mostly dead", owner). Jump still lists `.com`
  origins (for example in `src/core/redirect_policy.ts`) and the approved edges were designed before
  the split.
- Jump has not been reviewed for some time; its current behavior should be inventoried before it is
  relied on again.

## Decisions from the Cosmos side (owner, 2026-11-10)

Recorded in the Cosmos repositories' `adr/secure-jump-link-redirector.md`:

- Jump carries navigation only between subdomains of the same top-level domain. It never crosses a
  top-level domain; cross-TLD navigation, first-party included, always goes through Away with a
  notice page.
- Jump's strength is that it has no interstitial page, so it adds no waiting time.
- No gateway-to-gateway destinations: a Jump token must not name Jump or Away as its destination,
  and an Away token must not name Away or Jump. Each of Rails, Jump and Away refuses them, so no
  loop or chained hop can form.
- Rails leaves its origin only through Jump and Away, via one controller concern.

## To review here

1. Inventory current behavior: token verification, issuer JWKS sources, approved edges, path
   denylist, return-token issuance, logging.
2. Re-map approved edges and origin lists to the post-split hosts and repositories; remove or
   deprecate `.com` entries if the `.com` surfaces are retired.
3. Completed by owner instruction on 2026-11-12: remove the `/sign/out` path
   denial ahead of the logout redesign. Keep allowlists and source-to-self
   rejection; see adr/0008-retire-logout-path-denial.md.
4. Enforce: destination is never Jump or Away; destination stays within the source's top-level
   domain.
5. Record findings in this repository's `evidence/` and update its ADRs.
6. Read `memo/2026-10-04-jump-internal-only.md` (the internal-only investigation stopped on
   2026-10-04) as background for this review. When the review ends, move its still-relevant content
   into `research/` or `plans/` and remove the `memo/` folder, so this repository keeps notes in the
   same places as the Cosmos repositories.

## Signing algorithm: ES384 to PS256 (owner, 2026-11-10)

The Cosmos repositories adopted PS256 (RSA 3072, RSASSA-PSS with SHA-256) for every JWT they sign,
with signing keys in AWS KMS (`adr/cosmos-jwt-ps256-and-op-signing-in-aws-kms.md` in the Cosmos
repositories, amended 2026-11-10 to cover Jump tokens). Jump must follow, with changes on both the
Rails side and this Hono gateway:

1. Prerequisite: the Cosmos signer component and KMS migration (planned after the split).
2. Owner superseded the compatibility rollout: PS256 only, RSA 3072. ES384 is
   rejected; there is no dual-algorithm transition (2026-11-12).
3. Rails signs inbound tokens and verifies return tokens with PS256. Jump signs
   return tokens with PS256; configure new keys before deployment.

Decided (owner, 2026-11-10): Jump's signing key lives in Workers secrets and Jump signs with
WebCrypto RSA-PSS. The private key is visible to Workers secret administrators; accepted, because
calling KMS would add latency. Restrict who can read or change the secret, rotate on suspicion, and
keep return tokens short-lived.

## After Jump: Away

Order (owner, 2026-11-10): AWS KMS signing keys in the Cosmos repositories first, then Jump adopts
PS256, then Away is built.

Once this Jump work is done, build Away (`away.umaxica.net`, repository `umaxica-apps-edge-away`).
Its job is small: verify the Rails-issued JWT (PS256, issuer JWKS, issuer, audience, purpose,
expiry) and render a notice page with a link to the destination. It shows the notice for every
destination, including first-party cross-TLD moves; it never redirects automatically, never
re-signs, never names Jump or Away as a destination, and passes no token or referrer onward.
