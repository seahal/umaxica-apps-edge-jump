# CI dependency audit investigation

Read the actual GitHub Actions job summaries and dependency-job logs for
commit `5c82d5b3883840637481d13babfe5902db02f99a`:

- Push run: https://github.com/seahal/umaxica-apps-edge-jump/actions/runs/36895715687
  (failed job `110482068113`).
- Pull-request run: https://github.com/seahal/umaxica-apps-edge-jump/actions/runs/36895748439
  (failed job `110482179776`, checkout was PR 51's merge commit).

Both runs failed only the `dependencies` job, at
`pnpm audit --audit-level=high`, exit 1. Frozen installation succeeded.
Both logs reported 10 vulnerabilities: three low, five moderate, two high.
The two high advisories were:

- `GHSA-rfgv-xxqx-mfg5`: undici denial of service via unrequested WebSocket
  subprotocol; affected range `>=7.0.0 <7.29.1`.
- `GHSA-w293-vg96-wgc3`: undici TLS certificate validation bypass via dropped
  connect options in BalancedPool; affected range `>=7.24.1 <7.29.1`.

Both audit entries identify `.>wrangler>miniflare>undici` and a patched range
of `>=7.29.1`. The current lockfile confirms Wrangler 4.143.0,
Miniflare 5.20260926.0-alpha and undici 7.29.0 in that dependency chain.

In both runs, `quality`, `unit` (coverage), `e2e`, `secret-scan`, and
`cloudflare-dry-run` succeeded. These are two failed workflow runs with the
same dependency-audit cause; neither log attributes the failure to JWT root
validation. CI browser E2E succeeded despite the local audit environment's
known tsx IPC socket restriction.

Investigation used `gh run list`, GitHub connector run/job/log reads,
and local workflow/lockfile inspection. No dependency, application, workflow,
remote state, or existing deleted-file changes were made. A fix must resolve
the affected transitive dependency to a patched version and repeat audit and
compatibility checks; that update was not performed in this investigation.
