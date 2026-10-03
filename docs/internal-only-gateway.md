# Jump internal-only target contract

Status: draft target contract. This describes intended behavior, not an
implemented or verified production state. The current normative protocol remains
[docs/protocol.md](protocol.md) until runtime enforcement is implemented.
See [ADR 0007](../adr/0007-remove-external-destinations.md) for rationale,
[the plan](../plans/jump-internal-only.md) for execution order and
[the dated memo](../memo/2026-10-04-jump-internal-only.md) for investigation status.

## Redirect eligibility

Schema 1 retains required dst. It expresses the issuer's requested transition
class; it is not proof that the destination is trusted.

```text
redirect eligibility =
  dst exists and is exactly "internal"
  AND destination URL canonicalization succeeds
  AND destination origin is a permitted registered internal origin
  AND destination origin exactly matches this issuer's internal allowlist
  AND existing self-destination, URL, JWT, signature and lifetime checks pass
```

Never infer dst from the URL. Do not normalize discriminator case, supply a
missing value, repair malformed input or silently fall back. Exact origin
matching cannot be replaced by suffix, prefix, wildcard or regex matching.

## Request partitions and acceptance criteria

| Case | Discriminator and destination | Required outcome |
| --- | --- | --- |
| A | `internal` + permitted internal URL | Existing 302 and outbound RT semantic contract |
| B | `internal` + external/unlisted URL | Reject without signing or navigation |
| C | `external` + externally allowlisted URL | Reject even when issuer configuration permits external |
| D | `external` + permitted internal URL | Reject; never infer internal from the URL |
| E | Unknown or case variant + permitted internal URL | Reject; never normalize or default dst |
| F | Missing, null, empty or malformed dst + permitted internal URL | Reject; never infer dst |

For C and D, deliberately enable external policy in the test fixture. Include
both an external destination and an internal-eligible origin in its external
allowlist so accidental configuration cannot rescue either request.

Rejected instructions must have a non-3xx response, no Location, no cushion
rendering, no Away forwarding, no internal fallback and no outbound RT issuance.
Use existing public error mapping: destination rejection normally returns 400
invalid_request; earlier dependency, rate-limit and deadline failures retain
their existing non-3xx responses. Do not require every failure to become 400.

EP partitions are valid internal, known unsupported external, unknown, missing
and malformed. BVA/type/encoding cases include null, undefined as JSON omission,
empty/whitespace, 0, booleans, arrays/objects, case differences, NUL and applicable
string/encoding boundaries. An undefined value is not a JSON wire value.

After dormant code removal, permanently retain B, C, D, E and F rejection
regressions. Their purpose is to prevent URL inference, fallback and accidental
reintroduction of external capability.

## Internal semantic regression baseline

Preserve the 13-node production graph: 20 permitted edges and 149 denied ordered
pairs. Existing production contracts are the baseline, not token byte snapshots.

Verify 302 and Location origin/path/query semantics, exactly one outbound RT,
ES384 signature/header, exact required claims, issuer/audience/source/destination,
canonical URL binding, schema 1, required dst, 30-second TTL and fresh jti.
Timestamps and jti can vary without changing the contract.

Dst validation and URL/issuer policy are independent requirements. A valid
internal discriminator cannot authorize an external URL. A permitted internal
URL cannot authorize external, missing, unknown or malformed dst.

## Service and compatibility boundaries

Jump supports registered internal navigation. Away independently supports
external confirmation at `away.umaxica.net`; external callers select it directly.
No Jump-to-Away redirect, forwarding, RT exchange, fallback or compatibility
bridge is allowed. Do not reuse Jump's signing keys or JWKS for Away.

Schema changes, dst removal, internal routing/signing changes, `/about` fallback
removal, trust expansion, Rails cleanup and Away implementation are outside
this change. Shared URL/IDNA, headers, CSS, layout, errors, logging, deadline and
rate limit must be preserved until individually reviewed.

## Validation reference

Re-read package.json and CI when work resumes; these are the commands defined at
the documented baseline. This table is not a record of successful execution.

| Check | Existing command |
| --- | --- |
| Format | `pnpm run format:check` |
| Lint | `pnpm run lint:check` |
| Typecheck | `pnpm run typecheck` |
| Unit / CI coverage | `pnpm run test` / `pnpm run test:cov` |
| Production contract | `pnpm run test -- test/production-contract.test.ts` |
| Worker runtime | `pnpm run test:worker` |
| E2E | `pnpm run test:e2e` |
| Knip | `KNIP_DISABLE_RAW_TRANSFER=1 pnpm exec knip --include unlisted,unresolved,binaries` |
| Dependencies | `pnpm audit --audit-level=high`; `pnpm outdated` is informational |
| Cloudflare dry-run | `pnpm run cloudflare:check` |

CI also includes secret scanning. Match all results to the tested revision;
historical CI or a dry-run alone does not prove a changed production service.
