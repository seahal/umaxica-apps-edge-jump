# Stateless token risk follow-up

## Changes

The owner requested remediation of the two review findings and explicitly
accepted token reuse because persistent storage is unavailable. ADR 0010
supplements ADR 0002 and records inbound/outbound reuse, fresh outbound jti and
lifetime on reevaluation, and absence of a single-execution guarantee. No
storage, consume API or runtime change was introduced.

The security contract, receiver contract and existing receiver exposure report
now distinguish URL exposure from replay acceptance. They require independent
operation checks, sensitive-value minimization, endpoint log/APM redaction and
prompt clean-URL redirects with no-store/no-referrer. The receiver report no
longer mandates one-time jti consumption or claims it is the only replay defense.
Receiver implementations and deployed log settings were not changed or tested.
Sensitive URL transport remains an ASVS 14.2.1 gap; documentation is not proof of
its elimination. The security contract's stale EC importer member list was
corrected to RSA kty/n/e, matching the current implementation.

## Dependency remediation blocked

No Fastly/minimatch/jco runtime imports were found in src or scripts. Removal of
the unused Fastly production dependencies was attempted through pnpm. Initial
attempts failed with ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK. pnpm's current
official guidance identifies XDG_RUNTIME_DIR as the operation-lock location:
https://pnpm.io/uk/blog/releases/12.8.2

Using a private writable `/tmp/jump-pnpm-runtime` resolved that lock failure.
With the Fastly manifest entries removed, matching pnpm 12.18.0 then attempted
to verify 336 retained lock entries against supply-chain policies:

- `pnpm install --lockfile-only --offline`: failed ERR_PNPM_NO_OFFLINE_META for
  @babel/parser metadata in the configured npm.flatt.tech mirror cache.
- `timeout 30 pnpm install --lockfile-only`: timed out, exit 124, while verifying
  those entries; no updated lockfile was produced.
- `timeout 20 pnpm audit --prod --json`: timed out, exit 124, without a result.

Earlier pnpm remove attempts, including a temporary manifest/lock copy and
installed pnpm 12.0.0, also failed or were interrupted/timed out without a lock
update. No successful install or advisory audit is claimed. No policy was
disabled, registry changed, advisory suppressed or lockfile hand-edited.
The temporary manifest deletion was reverted to preserve agreement with the
unchanged lockfile. package.json and pnpm-lock.yaml therefore retain their
original Fastly dependencies and minimatch 10.2.6; GHSA-g3hv-75wg-m249 remains
open. Once mirror metadata is accessible, remove the two Fastly packages with
pnpm, verify no affected chain remains, frozen-install and repeat the checks.

## Validation

Matching locally installed pnpm 12.18.0 ran format:check, lint:check, typecheck
and test. During the temporary manifest deletion, script preflight install
warned that the operation lock could not be opened and then proceeded with the
existing installed dependencies. Format/lint/typecheck passed; these are
existing-install checks, not proof of a fresh dependency graph. Unit tests
passed: 22 files, 2233 tests, 36.56 seconds. After restoring the manifest,
format:check passed on 200 files without the preflight warning, and
`git diff --check` passed. Existing unrelated code/test changes were
preserved. No deployment or remote mutation occurred.
