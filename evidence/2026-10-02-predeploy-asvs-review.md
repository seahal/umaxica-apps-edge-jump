# Pre-deployment ASVS-oriented review — 2026-10-02

## Scope and conclusion

Reviewed the current working tree based on HEAD
`a47a3aba91c001cde88bfc42647253f562879ba0`, including existing uncommitted
changes. Production scope is the Cloudflare entrypoint and shared Jump code;
experimental Fastly and receiving applications are outside this assessment.
No implementation, dependency, secret, deployment or remote configuration was
changed. This review covers selected OWASP ASVS 5.0.0 security areas; it is not
a full ASVS level certification or a production penetration test.

No Critical/High vulnerability was demonstrated in the inspected paths. One
Low input-validation/error-classification issue was reproduced. Dependency
advisories and production controls remain unverified, so this is not a complete
release security signoff.

## Confirmed finding

**Low: JSON null in a JWT header or payload produces 500 instead of 400.**
`src/core/verify_jwt.ts:40-41` and `:51-52` access properties on decoded JSON
without checking that the decoded value is a non-null object. A compact dummy
token containing JSON `null` in either position throws a TypeError before
signature verification. `handleJump` converts this to `500 internal_error`.

A temporary in-process probe used `createApp` with a local runtime and synthetic
unsigned tokens. Both null-header and null-payload cases returned 500,
`X-Jump-Error: internal_error`, `Cache-Control: no-store`, and no Location.
An unknown-issuer control returned `400 invalid_request`. No real credentials
or valid production tokens were used. The probe ran successfully via
`pnpm exec node --import tsx /tmp/jump-asvs-probe-20261002.mts`.

Impact is attacker-triggered server-error responses and misleading failure
telemetry; no signature bypass, token disclosure, or persistent outage was
demonstrated. Suggested fix: decode to unknown, require a non-null, non-array
object before accessing claims, and return the existing client-denial class.
Implementation was left unchanged for this audit.

## Selected security controls reviewed

| Area                                   | Current local evidence                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validation and redirect authorization  | Registry trusts six exact issuers; destination policy permits fourteen same-TLD directed edges, external redirects disabled. URL normalization rejects userinfo, production HTTP, self-links and multiple private/special IP forms. Tests cover the routing matrix, prototype issuer names, alternate IP forms and origin equivalence.                                            |
| Self-contained tokens and cryptography | ES384-only, JWT typ and bounded kid, embedded key hints rejected, issuer/audience/schema/sub/time/TTL validated. Input capped at 8192 characters, input TTL 300 seconds plus five-second clock tolerance; outbound TTL 30 seconds and fresh random jti.                                                                                                                           |
| JWKS transport and availability        | Registry-pinned same-origin HTTPS well-known endpoint; redirects rejected, JSON content type required, streaming body capped at 64 KiB. Private JWK fields and duplicate usable kids rejected. Cache includes fetch deduplication, refresh cooldown and bounded negative entries.                                                                                                 |
| Key handling                           | Configured public/private keys are pair-checked before signing or publication; production config includes public JWKS, allowing a non-extractable imported private key. Actual deployed private key was not read or verified.                                                                                                                                                     |
| Browser controls                       | Dynamic HTML uses JSX escaping; raw content is fixed CSS/script. Hash-pinned restrictive CSP, no-referrer, no-store, no cookies and frame denial cover application, static asset and rate-limit responses in tests.                                                                                                                                                               |
| Logging and configuration              | Application logs permit fixed public paths only and omit query tokens; observability config redacts query strings, disables invocation logs and trace persistence/export. Local schema recognizes these settings. CI uses pinned action commits, read-only contents permissions, frozen install, dependency audit and history secret-scan jobs. Remote execution was not checked. |

Additional local slash probes for `//attacker.invalid/` and an encoded slash
variant returned same-origin 301 locations; no cross-origin redirect was
observed. `/about/?rt=dummy` retained the dummy query in a same-origin 301:
informational-route normalization does not consume tokens. This is not evidence
of disclosure to a third party; URL-visible tokens remain subject to browser
history and receiver logging controls.

Schema-1 token reuse until expiry is the documented stateless contract, not a
new finding. Receivers must provide their own authentication, authorization,
CSRF and replay-sensitive side-effect controls; those applications were not
audited here. Rate-limiter faults deliberately fail open as abuse control;
signature and destination authorization remain enforced.

## Executed checks

Successful commands used the installed pnpm 12.0.0 and Node 24.20.0 by prepending
their mise install directories to PATH. Mutating format/lint scripts were
replaced with the repository's check-only variants to preserve existing work.

- `pnpm run format:check`: passed, 94 files before adding this record.
- `pnpm run lint:check`: passed.
- `pnpm run typecheck`: passed.
- `pnpm run test`: passed, four files / 193 tests.
- `pnpm run cloudflare:check`: passed with Wrangler 4.143.0; dry-run bundle
  279.16 KiB / gzip 68.15 KiB. No deployment occurred.
- `git diff --check`: passed before adding this record.
- Limited filename-only working-tree secret-pattern scan: no matches for
  private-key PEM headers, AWS access-key IDs or common GitHub token prefixes.
  Excluded dependencies, Git metadata, lockfile, evidence and generated output.
  This was not a complete secret or Git-history scan.
- Inspected installed Workers types 5.20260928.1 for rate-limiter signatures
  and Wrangler's local schema for observability configuration.

## Incomplete verification

- `timeout 25s pnpm audit --json --registry=https://registry.npmjs.org` exited
  124 with no advisory result. `curl -I --max-time 8` to that registry failed
  DNS resolution (exit 6). Advisory status and latest registry types could not
  be established; the lockfile was not changed.
- Default pnpm 12.4.2 could not verify the project's pnpm identity against the
  registry (`ERR_PNPM_PNPM_ENGINE_IDENTITY_UNVERIFIABLE`). Existing installed
  project-version tooling completed local checks successfully.
- `pnpm run test:e2e` could not start its web server: tsx IPC socket creation
  failed with `listen EPERM`. No browser E2E result was obtained. The temporary
  probe initially hit the same restriction through the tsx CLI, then succeeded
  through Node's tsx import hook without starting a server.
- A non-mutating request to production `/health.json` failed DNS resolution
  (curl exit 6 / HTTP 000). Live TLS/headers, valid issuer handshake, deployed
  secrets/JWKS, zone response transforms/body rewriting, actual log retention
  and receiver behavior remain unverified.

Before release security signoff, complete the dependency audit and browser
checks in an environment with registry access and server permissions, then
verify the production configuration and handshake described in
`docs/operations/production-configuration.md`. Consider correcting the Low
finding separately; this audit did not authorize implementation changes.

References consulted:
[OWASP ASVS](https://owasp.org/projects/asvs) and
[Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).
