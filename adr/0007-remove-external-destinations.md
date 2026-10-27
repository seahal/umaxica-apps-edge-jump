# ADR 0007: Make Jump an internal-only gateway

Status: accepted for local capability retirement (2026-10-11, explicit user authorization). Production release gates remain open.
Target release: 0.4.0, subject to the phase verification gates.

## Candidate implementation status (2026-10-11)

The 0e0b3c6 baseline already rejects external, missing and malformed dst in
runtime and has no external registry field. Local regressions passed. The
0.4.0 candidate adds independent pathname and transfer-query defense. The user confirmed that Cushion is unused and explicitly authorized deletion.
The renderer, external-only IDNA display, translations, CSS and CSP permission
are removed locally, with permanent external rejection tests retained. This
confirmation is user-provided, not measured production usage. Phase 3 source
retirement is implemented; runtime/browser/CI and production closure are still
BLOCKED. No Away compatibility path is introduced.

## Historical context

Jump currently has two destination paths. Internal instructions pass the issuer
origin graph and produce a redirect carrying a newly signed RT. Externally
allowlisted instructions can produce a cushion page through injected registries.
The repository's production registry disables external destinations for all
issuers; that fact alone does not establish the deployed revision or non-use.

Internal trust is established through signatures, canonical URLs and approved
issuer-to-destination edges. External confirmation relies on a human decision
and belongs to an independent service. Keeping both capabilities in Jump adds
an unnecessary trust model and attack surface.

## Proposal

Jump permanently handles registered UMAXICA internal destinations only. Away
independently handles external confirmation at `away.umaxica.net`. External
callers select Away directly; Jump must not become an Away compatibility gateway
through redirect, forwarding, RT exchange or fallback. Away does not reuse Jump
signing keys or JWKS.

Schema 1 and required `dst` remain. `dst` is the issuer's explicit protocol
discriminator, not proof of destination safety. A redirect requires both exact
`dst: internal` and successful independent canonical URL/internal allowlist
validation, together with all existing JWT and internal policy checks.

External, unknown, missing and malformed discriminators fail closed even when
the URL is eligible for internal routing. Do not infer dst from a URL, normalize
its case or silently choose another destination. External capability retirement
and any future dst removal are separate protocol decisions; no claim removal or
schema change is proposed here.

## Delivery boundaries

1. Verify and fix the production baseline as evidence, without inventing a
   setting change when external is already disabled.
2. After that checkpoint, establish runtime rejection through observed RED,
   minimal implementation and GREEN, then CI, deployment and safe production
   verification. Startup failures and unexecuted tests are not RED or GREEN.
3. The 2026-10-11 explicit owner confirmation of non-use authorizes local
   dormant-code removal while retaining rejection regressions. This overrides
   the earlier local-removal sequencing gate, not production release checks.
   Close production verification separately; local deletion is not deployment.

Internal redirect/signing behavior remains unchanged. Shared URL validation, headers,
CSS, layout, errors, logs, deadline and rate limit require individual dependency
review before cleanup. `/about` fallback removal and Rails issuer cleanup are
separate changes. Away implementation is outside this proposal.

## Consequences

The resulting gateway has one accepted destination class and a smaller attack
surface. Callers relying on external RTs must stop using Jump for that purpose;
production non-use must be investigated rather than assumed.

Retaining dst distinguishes an explicit internal request from an unsupported or
malformed instruction. It does not replace URL validation or issuer allowlists.
Current protocol documentation must not claim enforcement merely because this
proposal or its tests exist.

## Related documents

- [Target contract and acceptance criteria](../docs/internal-only-gateway.md)
- [Implementation sequence and gates](../plans/jump-internal-only.md)
- [Dated investigation memo and stopping point](../memo/2026-10-04-jump-internal-only.md)
