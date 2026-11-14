# CI failure remediation

Base commit: `3ace9d1dc256bf6cd8efffdc0e002a0f1d694932`, 2026-11-14.
The earlier GitHub Actions review was already untracked and was retained.
This record describes local uncommitted changes; no commit, push, workflow
rerun, production key operation or deployment was performed.

## Changes and evidence

- `.github/workflows/integration.yaml`: moved only `quality` from
  `ubuntu-slim` to `ubuntu-latest` after the logged oxc allocator panic (exit
  134). All checks remain enabled. GitHub's current
  [runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
  lists slim as a 1-CPU/5-GB container and public-repository ubuntu-latest as a
  4-CPU/16-GB VM. Resource pressure is a hypothesis; the exact panic cause and
  success of the changed job require a new CI run.
- `scripts/test-worker.mjs`: compare the original destination with the verified
  signed URL and the raw Location plus appended RT. Do not mutate
  URLSearchParams before comparison. A synthetic, key-free reproduction run
  with `pnpm exec node --input-type=module -e ...` confirmed the old algorithm
  changes `%20` to `+` and fails equality; raw Location comparison passes.
- Updated the Worker harness's former logout-path expectations to permit
  `/sign/out`, `.html/`, `.json/` and `%2Ehtml/` under the current empty path
  denylist. Retained negative workerd checks for double slashes, encoded slash,
  encoded backslash and dot segments. Added a mixed `%20`/`+` OAuth query case.
  Application URL policy and signed-token validation were not relaxed.
- Included Palm in path checks so every one of the fixture's 13 origins is
  covered. The fixture still tests its existing 20 signed edges; this change
  does not claim full current production-graph workerd coverage.
- Generate a fresh ephemeral test RT for the late limiter-failure scenario
  rather than reusing an input that may have expired during earlier scenarios.
  The production TTL remains 30 seconds. Success output now uses the fixture's
  edge count instead of a hard-coded number.

## Validation

Used the installed Node 26.13.1 and pnpm 12.18.0 by prepending their mise
installation directories to PATH. No store configuration or lockfile changed.

- `pnpm run format`: passed.
- Final `pnpm run format:check`, `pnpm run lint:check`,
  `pnpm run typecheck`: passed.
- `pnpm run test`: 22 files / 2232 tests passed.
- `pnpm exec node --check scripts/test-worker.mjs`: passed after final edits.
- `git diff --check`: passed.
- Before and after the main harness changes, `pnpm run test:worker` stopped at
  internal listener startup with `listen EPERM` on `127.0.0.1`; no contract
  assertions were reached. The final fresh-token adjustment was syntax/lint
  checked; the runtime remains NOT_VERIFIED.
- `pnpm run test:e2e`: web server failed before browser tests with
  `listen EPERM` at `127.0.0.1:4173`.

CI resolution is NOT_VERIFIED until these changes are committed/pushed under
owner authorization and the new quality and Worker jobs pass. The existing
failed runs are not changed by local checks. No check was disabled or marked
continue-on-error to hide either failure.
