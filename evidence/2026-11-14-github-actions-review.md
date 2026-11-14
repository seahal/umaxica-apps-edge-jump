# GitHub Actions failure review

Read on 2026-11-14. Current local HEAD is
`3ace9d1dc256bf6cd8efffdc0e002a0f1d694932`; worktree was clean before this record.
`gh run list` could not connect to api.github.com from the shell, so the GitHub
connector was used for run/job metadata and decoded failed-job logs.

Latest [PR run 43532239436](https://github.com/seahal/umaxica-apps-edge-jump/actions/runs/43532239436)
and [push run 43532233462](https://github.com/seahal/umaxica-apps-edge-jump/actions/runs/43532233462)
both failed for head `3ace9d1`. Each has two failed jobs out of seven:
`quality` and `worker-runtime`. PR checks ran merge SHA
`a910b0488e29e74635d505a46e8272cbc5001845`.

- PR quality job `132252534190`: format passed; lint crashed in
  `crates/oxc_allocator/src/pool/fixed_size.rs:112:67`,
  `Result::unwrap()` on `Err(())`, exit 134. This is a tool panic, not a lint
  diagnostic. The exact allocation/resource cause was not established.
  Typecheck and knip were skipped after this failure.
- PR Worker job `132252533814`: workerd started and the harness failed with
  `ERR_ASSERTION`, “Expected values to be strictly equal”, exit 1. This is
  not the local listen-EPERM limitation. The safe log intentionally omits the
  assertion location and values, so the precise failing assertion is unconfirmed.
- Source inspection identifies likely stale harness expectations: deleting RT
  using URLSearchParams changes `%20` to `+` before comparing against a signed
  raw query, and logout format paths are still expected to be denied after the
  owner removed that deny policy. These are candidates, not runtime proof of
  the exact CI failure point.
- Unit/coverage, E2E, dependencies, secret scan and Cloudflare dry-run succeeded
  in both runs. No production or receiver acceptance follows from those passes.

Only this evidence record was added. No fix, rerun, remote mutation, key operation
or deployment was performed. Earlier local check success does not establish
CI readiness; the two failed gates remain open.
