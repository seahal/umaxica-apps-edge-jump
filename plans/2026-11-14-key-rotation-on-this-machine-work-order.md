Task (umaxica-apps-edge-jump): finish the pre-launch key rotation so Jump serves a consistent PS256
key set, then check that the Base App sign entry can pass through Jump. This order carries out
Part 1 of `plans/2026-11-14-handoff-carrier-readiness-work-order.md` on this machine and narrows its
Part 2 with what was found today. Its Part 3 (URL limits) is unchanged and stays with that order.
No commit unless the owner asks. Never print secrets, key material or environment values. Every
step that changes a secret, a Worker version, a deployment or any Cloudflare setting needs the
owner's approval at execution time, one step at a time.

## What changed since the earlier order

Owner, 2026-11-14: Jump and Away are operated on this machine too. The earlier statements that the
PS256 code or the rotation exist "only on the other machine" no longer hold. The PS256 code is in
this tree (`80667ca`, `0eb2959`).

Owner, 2026-11-14: a redirect to a different FQDN goes through Jump even when it is an OpenID
Connect authorization request. `plans/2026-11-11-oidc-protocol-redirects-bypass-jump.md` stays
discarded.

## Verified on this machine on 2026-11-14 (commit `6815347`)

- `GET https://jump.umaxica.net/.well-known/jwks.json` answers 503. `GET /health` answers OK,
  version `0.4.0`, edge `cloudflare`.
- `wrangler deployments list`: version `8b73e1b8-be84-418b-b669-d4aacfbe9a13` is at 100% since
  2026-11-11 ("Observe Jump with PS256 key B"). Per `evidence/2026-11-12-key-rotation-ps256.md` it
  holds key B's private secret with the old ES384 `kid` and public JWKS, so the pair check fails.
- Wrangler is signed in for the host user (`wrangler whoami` succeeds).
- `pnpm run typecheck` passes. `pnpm run test` passes: 22 files, 2,223 tests.
- `package.json` `packageManager`: the `sha512` value was 127 hexadecimal characters; the last
  character was missing, so `vp` refused to start with "Hash mismatch for pnpm@12.18.0". The
  missing character was restored (128 characters; uncommitted). Keep this change.
- Key B's cold-storage directory (`secrets/jump-ps256-2026-11-12/`, with `public-jwks.json`) is
  **not on this machine**. A public key cannot be read back from a Worker secret.
- `scripts/generate-jump-keypair.mjs` already generates RSA 3072 / PS256 and writes `private.pem`,
  `public-jwks.json` and `wrangler-secrets.json`.
- `evidence/2026-11-14-implementation-status-check.md` reports that every pnpm script stopped with
  `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK` (read-only file system). The scripts do run on the host.
  If your environment still cannot run them, say so in the evidence and do not present earlier
  results as current; do not work around it by editing lockfiles or the store configuration.

## Part 1: rotation (owner approval before each numbered step that changes anything)

Follow `docs/operations/key-rotation.md`, "Pre-launch rotation: close, replace, verify, reopen".
Jump carries no real traffic, so there is no prepublication and no grace period.

0. Key choice (owner decides first). Default: generate a new key C on this machine and retire B
   unused, because B's public JWK is not here. Alternative: the owner brings B's `public-jwks.json`
   and B's `kid` (`jump-prod-2026-11-12-ps256-f3b40484`) is kept. Do not start step 2 before this
   is answered.
1. Close: a Cloudflare Access application on `jump.umaxica.net` that admits only the operators.
   Confirm that a request without Access is refused. If you cannot create it, give the owner the
   exact settings and wait.
2. Generate (default path): `pnpm run keys:generate -- <new empty directory outside the
   repository> <kid>` under `umask 077`. Propose the `kid` (new, never used before, date-stamped)
   and have the owner confirm it. Check the generator's result line: `result=ok`,
   `algorithm=PS256`, `modulus_bits=3072`, `pair_check_ok=true`. Tell the owner where the files
   are; the owner moves them to cold storage.
3. Secrets: put `UMAXICA_JUMP_PRIVATE_KEY_PEM`, `UMAXICA_JUMP_PRIVATE_KEY_KID` and
   `UMAXICA_JUMP_PUBLIC_JWKS` into **one** new Worker version together
   (`wrangler versions secret bulk`, values read from files, never from shell arguments or
   terminal output). The JWKS holds exactly the one public key. Nothing is deployed by this step.
   Record the version ID.
4. Deploy one consistent version: the code of the current tree with the three values from step 3.
   Run `pnpm run cloudflare:check` first. Never deploy a version in which only some of the three
   values are new. Record the version ID and the traffic assignment.
5. Verify through Access (`docs/operations/deployment-verification.md`):
   - `GET /health.json` 200;
   - `GET /.well-known/jwks.json` 200, exactly one key, `kty` RSA, `alg` PS256, `use` sig, modulus
     3072 bits or more, the expected `kid`, no private member;
   - a valid signed RT for an approved edge answers 302 and the outbound `rt` has `alg=PS256`, the
     active `kid`, and verifies against the published JWKS; an RT signed by a local test key is
     refused; an RT for a forbidden edge answers 400 with no `Location`. If no issuer key is
     available to you for the valid-RT check, record it as `NOT_VERIFIED` and say which repository
     can perform it;
   - Workers Observability shows no 503 and no `invalid_signature` for these requests.
     If any check fails: stay closed, fix the version, repeat steps 4 and 5.
6. Reopen: remove the Access application; repeat the public checks without Access.
7. Afterwards: list the Worker versions that still hold key A (ES384) or key B and propose how to
   prevent their redeployment; update `docs/backlog/2026-11-12-ps256-key-provisioning.md` and
   `plans/2026-11-12-handoff.md`; report to the owner the JWKS URL and the `kid` that the Cosmos
   repositories must trust.

## Part 2 (narrowed): what the registry already has, and what to report

Read today in `src/config/registry.umaxica.ts`: an issuer is its origin, its JWKS is
`<origin>/.well-known/jwks.json`, and these nodes and edges already exist:
`base-app-ww` = `https://www.umaxica.app`, `visa-app-ww` = `https://visa.umaxica.app`,
`auth-app-ww` = `https://auth.umaxica.app` (and the `org` equivalents), with edges in both
directions between Base and Visa and between Base and Auth, per realm.

Facts from the Cosmos side (read today; you cannot see those repositories, treat as given):
`https://www.umaxica.app` is served by Governance (Base App), `https://visa.umaxica.app` and
`https://auth.umaxica.app` by Access. Governance is restoring its Base App sign entry
(`POST /sign`), which sends the browser through Jump to `https://visa.umaxica.app/oauth/authorize`
with the OIDC query (`response_type`, `client_id`, `redirect_uri`, `code_challenge`,
`code_challenge_method`, `state`, `nonce`, `scope`, `ri`); the `rt` is signed PS256 by the Base App
issuer. Sphere documents Core on `www-jp.umaxica.*`, while this registry has `core-*-jp` on
`jp.umaxica.*` and `warp-*-jp` on `www-jp.umaxica.*`.

Do, without changing behaviour:

- Decide from the code whether "Governance in the registry" needs a new namespace at all, or is
  already expressed by the `base-*` nodes now that Governance serves those hosts. State what a
  dedicated Governance namespace would add and what it would cost. The owner decides.
- Confirm with tests (add them if missing) that an `rt` from the `base-app-ww` issuer to
  `https://visa.umaxica.app/oauth/authorize` is permitted with every query parameter above
  preserved byte for byte, that the same issuer cannot reach `visa-org-ww` or any unlisted
  destination, and that no query value reaches a log, trace or error path. Measure the `rt` length
  for a realistic authorization URL (PS256 `state` of about 700 characters) against
  `MAX_URL_LENGTH` and `MAX_TOKEN_LENGTH` and report the margin.
- Report the Core/Warp host difference above and the `.com` nodes as questions for the owner. Do
  not edit the node table.

## Checks and report

`pnpm run format:check`, `pnpm run lint:check`, `pnpm run typecheck`, `pnpm run test`, and
`pnpm run test:e2e` if a redirect behaviour test was added.

Operation record in `evidence/2026-11-14-key-rotation.md` as `docs/operations/key-rotation.md`
("Operation record") requires: operator, old and new `kid`, version IDs, the result of each step
with times, incomplete checks with reason and owner. Part 2 findings in
`evidence/2026-11-14-base-app-authorize-edge.md` (full `git rev-parse HEAD`; whether uncommitted
changes affected results). No private key, secret bundle content, live token or raw log in either
file.
