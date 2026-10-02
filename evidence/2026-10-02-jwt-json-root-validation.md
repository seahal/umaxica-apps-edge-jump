# JWT JSON root validation

## Scope and cause

Fixed the Low finding in the pre-deployment ASVS-oriented review. The generic
`decodeJson<T>` cast did not validate runtime root shape; a decoded `null`
reached property access and raised TypeError, which `handleJump` classified as
`500 internal_error`.

`decodeJsonObject` now parses into `unknown`, requires a non-null, non-array
object, and only then returns an object whose field values remain `unknown`.
Existing header/claim validation follows. Invalid header roots use
`invalid_header`; invalid payload roots use `malformed`. The public error
mapping and internal-error fallback were not changed.

## TDD and regression results

- Added tests before modifying `src/core/verify_jwt.ts`.
- Red run: `pnpm run test -- test/jump.test.ts -t 'JSON root boundary'`
  actually ran all four test files with this pnpm script argument handling:
  203 passed, eight failed. Header and payload `null` each returned 500.
  Six other invalid payload roots failed the expected `malformed` audit
  classification because they previously used `invalid_claim`.
- Green focused run: `pnpm exec vitest run test/jump.test.ts -t 'JSON root boundary'`:
  18 passed, 169 skipped.
- Each header/payload independently covers `null`, `[]`, `"string"`, `0`, `1`,
  `true`, `false`, `{}`, and malformed JSON `{`, using Base64URL segments and
  `dummy-signature`. Every case asserts HTTP 400, `X-Jump-Error: invalid_request`,
  no Location, `Cache-Control: no-store`, explicitly not 500/internal_error,
  the internal audit reason, and no JWKS fetch.
- `{}` passes root shape validation and fails required fields:
  header `invalid_header`, payload `invalid_claim`.
- Existing invalid Base64URL, unknown issuer, malformed payload JSON, and valid
  signed token tests also passed in the full suite.

## Verification

Used installed pnpm 12.0.0 and Node 24.20.0 via their mise PATH directories.
The default pnpm 12.4.2 invocation produced no output and was interrupted;
no dependency or lockfile changes were made for this fix.

- `pnpm run format:check`: passed, 95 files before adding this record.
- `pnpm run lint:check`: passed.
- `pnpm run typecheck`: passed.
- `pnpm run test`: passed, four files / 211 tests.
- `git diff --check`: passed.
- `pnpm run test:e2e`: incomplete, exit 1. Web-server startup failed at tsx
  IPC socket creation with `listen EPERM` under `/tmp/tsx-1000/118.pipe`.
  No browser E2E assertions ran. This matches the known audit-environment
  restriction; infrastructure was not modified. The generated last-run
  metadata was restored to its pre-run contents.

## Cross-runtime contract

`docs/architecture.md` now requires both decoded compact JWT segments to have
a JSON object root in language-independent terms, documents client-denial
responses and internal classifications, and lists candidate vectors above.
Rails must reproduce the Hono reference behavior, including rejecting invalid
roots before field validation, JWKS lookup, or signature verification. Rails
implementation and live deployment were not part of this verification.
