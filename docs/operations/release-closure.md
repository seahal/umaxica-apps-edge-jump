# Jump 0.3 release closure packet

All gates below are OPEN until the named evidence exists. This packet authorizes
no remote mutation, deployment, rotation or Rails change. Operators execute it
under separate release authorization. Local passes do not close remote gates.
Record date, owner, target environment, exact source/lock hashes, immutable IDs,
check run URLs and results in a flat `evidence/YYYY-MM-DD-release-closure.md`.
Never record private PEM, secret contents, raw RT/JWT or raw request logs.

## Dependency and runtime gate — dependency maintainer / CI owner

1. Keep `https://npm.flatt.tech/` and pnpm 12.0.0. Restore mirror DNS/connectivity
   and full policy metadata access; do not switch registry or disable policy.
2. Run `pnpm install --frozen-lockfile`. If resolution needs regeneration, use
   `pnpm install --lockfile-only`, review the targeted diff, then frozen install.
3. Run `pnpm why undici --json`; both direct Miniflare and Wrangler -> Miniflare
   paths must resolve 7.29.1, with no vulnerable Undici snapshot in the lock.
4. Run `pnpm audit --audit-level=high` and retain a fresh full advisory summary.
   Current CI blocks High/Critical; every remaining Medium needs a named,
   reviewed disposition. No advisory ignore is permitted.
5. Run format:check, lint:check, typecheck, test, test:cov, CI/full knip,
   `pnpm peers check`, test:worker, test:e2e and cloudflare:check. Keep thresholds.

CLOSED: frozen installed tree agrees with reviewed lock, known two Undici High
advisories absent, fresh audit satisfies policy, and all required checks pass on
the exact candidate SHA. Lock remediation alone does not prove installed runtime.

Miniflare 5.20260926.0-alpha already uses dispatchFetch in this repository.
Its startup unconditionally starts an HTTP/2 loopback server and workerd sockets;
dispatchFetch forwards through an Undici Pool to the runtime entry URL. It is not
a socket-free in-process API. On listen EPERM, retain workerd validation as a
CI_REQUIRED_GATE. Run test:worker and browser E2E in a socket-capable authorized
runner; record SHA, Miniflare/workerd versions and passing run URLs. Do not weaken
the harness, add a Node-only replacement, suppress failures or bypass sandboxing.

## GitHub protection — repository administrator

Inspect Settings -> Rules -> Rulesets for main, and the exact emitted CI contexts.
Required contexts from `.github/workflows/integration.yaml`: `quality`, `unit` (coverage),
`worker-runtime`, `e2e`, `secret-scan`, `cloudflare-dry-run`, `dependencies` (audit).
Confirm context producer/app identity and prevent similarly named checks spoofing
required results. Confirm rules target main, enforcement is active, required checks
are configured, and review direct-push/admin/integration bypass actors and modes.
Any permitted bypass needs an explicit owner-approved policy; unexplained bypass
keeps this gate OPEN. Test protection using an authorized non-production procedure.

CLOSED: record ruleset ID, enforcement state, main target, complete required
contexts/app identities, approved bypass policy and enforcement verification,
plus successful candidate check run URLs. A workflow file alone is insufficient.
No remote setting was changed by the closure pass.

## Rollback-compatible artifact — release / receiver owners

Obtain an actual immutable Worker version ID under separate authorization.
Map it to exact 0.3.0 code, bundle/source hash, lock hash, configuration and secret
version references. Verify every item below against that artifact:

- schema 1, ES384/P-384, exact rpl=reuse, stateless; no DB/KV/Durable Object;
- 13 canonical nodes / exactly 20 directed edges; production external redirects
  disabled while capability remains; test forbidden transitions too;
- inbound structural TTL <=30 seconds and outbound exp-iat exactly 30 seconds;
- UMAXICA_JUMP_ORIGIN and actual request-origin equality;
- explicit public JWKS, active kid present, non-extractable private import,
  successful active pair probe, no runtime private-to-public fallback;
- one active private signer B; current B-compatible recovery and required public
  grace keys; no compromised/revoked A restoration or stale mutable secret reference;
- current security headers, no Set-Cookie and Cache-Control no-store;
- missing limiter binding/IP fail closed, false ->429, only binding-call runtime
  exception warns and proceeds through full verification;
- invocation logs, traces and persistence enabled; sampling 100%; query redaction;
- successful real workerd validation of artifact-equivalent bundle/config, signed
  transitions and failure cases; receiver verification of B and all contracts.

CLOSED: immutable version ID and all checklist results recorded, B-compatible
recovery actually tested, and receiver owners supply compatibility evidence.
An arbitrary previous version or uncommitted tree cannot close this gate.
See [recovery](rollback-recovery.md) and [rotation](key-rotation.md).

## Production bindings — Cloudflare operator

Read the actual target version's binding/config inventory without exporting secrets.
Verify UMAXICA_JUMP_ORIGIN; UMAXICA_JUMP_PRIVATE_KEY_KID;
UMAXICA_JUMP_PRIVATE_KEY_PEM binding existence (value never recorded);
UMAXICA_JUMP_PUBLIC_JWKS validity; active kid membership; active private/public pair
probe through an approved test flow; JUMP_RATE_LIMITER; version metadata binding
UMAXICA-APPS-EDGE-JUMP-VERSION; ASSETS with Worker first; query redaction;
invocation logs; traces; logs/traces persistence and 100% sampling; route/custom
domain and actual configured-origin routing. Confirm external redirects remain off.

CLOSED: inventory tied to actual immutable version/environment, all checks pass,
secret-version references only, and approved traffic test confirms bindings,
origin/signing/limiter/headers and observability. Local wrangler.jsonc and dry-run
are insufficient; external log export is not required or implemented here.

## Rails receiver URL contract — Rails receiver owner

Run the same `test/fixtures/receiver-contract.json` cases in actual Rails runtime
and real Hono -> Rails integration. Preserve duplicate query pairs before parsing.
Reject duplicate rt, rt[], nested rt, duplicate single-valued state/code and other
reserved parameters. Check ordering, percent serialization (space vs literal +),
and exact signed URL binding after removing exactly one literal decoded rt.
Do not weaken the Hono normative [receiver contract](../receiver-contract.md).

CLOSED: Rails revision, fixture hash, complete case results and actual receiver
integration results attached and approved by receiver owner. Hono fixture passes
alone do not close this gate. Rails was neither inspected nor changed here.

## Rails TTL contract — Rails receiver owner

Verify receiver acceptance of correctly signed Jump outbound structural TTL 30s,
expiry and current-time tolerance boundaries, and rejection of invalid signatures
or excessive structural lifetime. Rails user-configurable issuer TTL controls
Rails -> Jump issuance; Jump return verifier max TTL controls Jump -> Rails
acceptance. They are separate settings and must not accidentally share a 10s cap.

CLOSED: actual Rails runtime and integration tests demonstrate 30s acceptance
and separate issuer/return-verifier configuration, with revision/results and owner
approval. Until both Rails gates close, release remains BLOCKED_FOR_ROLLOUT.

## Final decision

ROLLOUT_STATUS remains BLOCKED_FOR_ROLLOUT until every gate above is CLOSED with
candidate-specific evidence. The release owner signs the packet with the exact
candidate SHA, immutable recovery/version IDs and linked receiver/protection/CI
records. This document contains no claim of production readiness.
