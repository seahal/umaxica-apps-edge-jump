# Glossary

- `issuer`: Application origin that signs an `rt` JWT.
- `destination`: Final URL target after Jump validation.
- `jump`: The gateway at `https://jump.example.net`. Its reference implementation is the Hono code in this repository.
- `reference implementation`: The Hono implementation in this repository. When implementations disagree, it is correct.
- `non-production implementation`: Any other program that speaks the Jump interface, such as the Rails-embedded one. Never used in production.
- `leap`: `https://leap.umaxica.net`, the Cloudflare Tunnel hostname of the non-production Rails implementation for development and test.
- `trust broker`: A service that validates signed intent and policy before crossing trust boundaries.
- `cushion page`: HTML page shown before external redirects.
- `internal destination`: Destination origin explicitly allowed in the issuer internal allowlist.
- `external destination`: Destination allowed by external policy and requiring a cushion page.
- `schema`: Integer JWT claim version. Initial value is `1`.
- `kid`: Key identifier in the JWT protected header.
- `active key`: Key used for signing and verification.
- `grace key`: Old key kept for verification only.
- `revoked key`: Key identifier that is immediately rejected.
- `self-referential redirect`: A redirect whose destination origin equals its
  source, or whose destination is Jump itself. Always prohibited.
