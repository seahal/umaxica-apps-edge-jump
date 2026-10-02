# UMAXICA Jump Gateway 0.3

Hono on Cloudflare Workers production verifies signed redirect instructions and
allows only the approved source → destination origin graph. The current identity
is `https://jump.umaxica.net`, supplied by required `UMAXICA_JUMP_ORIGIN`.
No development authorities, receiver emulator or other provider implementation
is provided. Web Standard core dependencies remain explicit.

Schema 1 intentionally requires `rpl: "reuse"` on both input and output. This is
an acceptance change from 0.1, despite the unchanged JWT schema. Every reuse
runs verification again and produces a fresh outbound `jti`. Jump does not grant
authentication, authorization, CSRF approval or permission to execute a transaction.
0.3 tightens inbound structural TTL to 30 seconds; output remains 30 seconds.
See [ADR 0006](adr/0006-jump-0.3-hardening.md). The 0.2 plan and earlier ADRs
are frozen historical records, not current validation or CI status.

Read [protocol](docs/protocol.md), [receiver obligations](docs/receiver-contract.md),
[configuration](docs/operations/production-configuration.md),
[rotation](docs/operations/key-rotation.md), and [compatibility](docs/compatibility.md).
[Current plan and traceability](plans/jump-0.3-hardening.md) record scope and acceptance.
[ADR 0005](adr/0005-production-jump-0.2.md) supersedes historical provider/Leap contracts.

```sh
pnpm install --frozen-lockfile
pnpm run format:check
pnpm run lint:check
pnpm run typecheck
pnpm run test
pnpm run test:cov
pnpm run test:e2e
pnpm run cloudflare:check
```

`cloudflare:check` is `wrangler deploy --dry-run`, with no upload. Local browser
and Worker tests use nonproduction generated keys and the production validation
rules. `/health*` reports responsiveness and service version, not signer readiness.
There is no readiness endpoint; verify deployments with `/health.json`,
`/.well-known/jwks.json` and a signed RT smoke as described in
[deployment verification](docs/operations/deployment-verification.md).
Local evidence cannot prove production bindings, issuer reachability, receiver
compatibility or a safe rollback artifact. Rollout remains gated separately.
