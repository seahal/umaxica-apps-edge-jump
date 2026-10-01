# Jump rate-limit namespace 520900 and dev port 5209

Date: 2026-09-21. Local working tree only. No GitHub, Cloudflare, or
production write. No production rate-limit probe.

## Before

`JUMP_RATE_LIMITER.namespace_id` was `1006`. `pnpm run cloudflare:dev` used
Wrangler generic port `8787`. Limit and period were already 600/60.

## After

Jump is the net/jump Global surface:

```text
52 + 09 + 00 = 520900
```

- `wrangler.jsonc`: `JUMP_RATE_LIMITER` `namespace_id` `520900`, limit 600,
  period 60.
- `package.json` `cloudflare:dev`: `--port 5209`.
- README local curl and default-port list: `5209`. Playwright E2E port `4173`
  is unchanged.

## Verification

- `pnpm run lint:check` — 0 warnings, 0 errors.
- `pnpm run typecheck` — pass.
- `pnpm run test` — 4 files, 191 tests pass, including
  `cloudflare jump limiter uses the net/jump namespace and internal port 5209`.
- `pnpm run cloudflare:check` — wrangler 4.132.0 dry-run; binding printed
  `env.JUMP_RATE_LIMITER (600 requests/60s)`. No deploy.

`pnpm run format:check` on the whole tree was not used as a gate: it reports
`test-results/.last-run.json`, which is generated output outside this change.

## Not verified

Live `wrangler dev` on 5209. Production Jump still serves the previously
deployed `1006` namespace until a human deploys.
