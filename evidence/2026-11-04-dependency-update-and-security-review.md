# Dependency update and security review

## Dependency changes

- Removed `@fastly/hono-fastly-compute` and `@fastly/js-compute`. No source file
  imports them, and ADR 0005 already requires Fastly dependencies to be removed.
  They were the only path to `minimatch <11.0.1` (GHSA-g3hv-75wg-m249).
- `pnpm update` within declared ranges: hono 4.13.16, jose 6.2.14,
  @types/node 26.6.6, knip 6.44.1, wrangler 4.156.0. Wrangler brings
  undici 7.30.1, which is outside every reported undici range (<7.30.1).
- `pnpm audit` went from 9 findings (4 high, 5 moderate) to none.

## CI repairs

CI run 40518813762 on `develop` (693e3ee) failed `quality`, `dependencies` and
`worker-runtime`. Locally, before these changes, `knip` reported unlisted
`miniflare` and `test:worker` stopped with `ERR_MODULE_NOT_FOUND`.

- `scripts/test-worker.mjs` now resolves Miniflare through `wrangler`. Adding
  `miniflare` as a direct devDependency was tried: pnpm 12.0.0 recorded it
  without its transitive `@types/node` peer suffix and left
  `node_modules/miniflare` as a dangling link, even after a clean reinstall.
- Once it ran, `test:worker` failed on its own assertion: it removed `rt` with
  `searchParams.delete`, which rewrote `%20` as `+`. Jump preserved `%20`
  correctly. The check now compares raw `Location` bytes.

## Checks run on 2026-11-04 (pnpm 12.0.0, Node 22.23.4 in the container)

- `format:check`, `lint:check`, `typecheck`: passed.
- `test:cov`: 20 files, 2,151 tests passed; statements 99.56 %.
- `test:worker`: 20 signed edges and the JWKS, Fetch Metadata, wrong-path,
  signing-material, limiter and deadline contracts passed.
- `knip --include unlisted,unresolved,binaries`: exit 0.
- `pnpm audit --audit-level=high`: no known vulnerabilities.
- `cloudflare:check`: dry run succeeded, 291.08 KiB (70.94 KiB gzip).
- `test:e2e`: 35 passed. The container's Chromium build differs from the one
  Playwright 1.64.1 expects, so this ran with a temporary config that set
  `executablePath: /opt/pw-browsers/chromium`; the repository config is unchanged.
- The container's pnpm 12 native binary was a placeholder because its install
  script had not run; running its `install.js` fixed the environment only.

## Security review result

Source review of `src/` plus request probes against `createApp`:

- Inbound JWT: header members, `alg`, `typ` per environment, closed claim set,
  exact string `aud`, `iss` from the registry, NumericDate bounds, 30 s TTL and
  JWKS fetched only from registry-pinned URLs are enforced. Defended.
- Redirect: the target origin must be an allowed edge of the verified issuer.
  `//evil.example/` answers 301 to `https://jump.umaxica.net//evil.example`
  (same host), and `rt` on other paths, repeated `rt`, `HEAD` and `POST` on `/`
  are refused. No open redirect was reproduced.
- Not applicable: sign-up, login, sessions, user data, IDOR, file upload, SQL or
  other stores. The service holds no users or storage.
- Informational: the request logger turns a target such as `//evil.example/`
  into `/`, because it resolves the target as a network-path reference. This
  makes logs less exact; no secret is exposed.

Not verified: live issuer JWKS, deployed Workers, Cloudflare rate limiter and
WAF behaviour, Rails receivers, and whether `visa.umaxica.app` / `visa.umaxica.org`
need a `/sign/out` path denial. `test/fixtures/production-graph.json` still has
13 nodes and 20 edges, so `test:worker` does not exercise the 18 Visa edges;
unit tests do.
