# Dependency trust and audit policy

Use pnpm 12.0.0 from packageManager, CI frozen installation and the checked-in
lockfile. `pmOnFail: error` refuses mismatched versions without downloading or
switching package managers. `ignoreScripts: true` denies lifecycle scripts;
`allowBuilds` retains explicit esbuild/workerd denial. Unknown dependency builds
are not approved. Removed `ignoredBuiltDependencies` was redundant with script
denial and not an allowlist. `engineStrict: false` intentionally avoids newly
enforcing the previously ignored .npmrc engine policy; Node/typings are unchanged.

The selected registry remains `https://npm.flatt.tech/`. It provides the package
metadata, tarballs and audit endpoint used by this repository; it is an external
supply-chain trust boundary, not a safety guarantee. The repository does not
assert its internal mirroring or scanning behavior. Metadata controls version
selection, release-age checks and audit completeness. Lockfile integrity pins
expected tarball bytes for frozen installation, but does not authenticate all
metadata, prove advisory completeness or make a malicious resolved package safe.
Do not change registry on outage: new resolutions/uncached downloads/audit can
block; usable installed dependencies may still support local checks. Restore
registry access and rerun the blocked checks rather than bypassing them.

`minimumReleaseAge: 4320` minutes remains enabled. A security patch exception,
when actually needed, must name only the exact package/version in
minimumReleaseAgeExclude and document why. No blanket exception is permitted.
The closure pass adds only `undici@7.29.0: 7.29.1`. Miniflare pins
7.29.0 exactly: the override intentionally replaces that pin with the upstream
security patch on the same minor line; it is not within the original exact
constraint. Both direct Miniflare and Wrangler paths share this snapshot.
No minimumReleaseAge exception is added. Remove the override when both upstream
paths naturally resolve patched versions and fresh audit/runtime checks pass.
See GHSA-rfgv-xxqx-mfg5 and GHSA-w293-vg96-wgc3 and the
[closure evidence](../evidence/2026-10-03-jump-0-3-closure.md).

Fix advisories by compatible updates first, then parent-scoped or vulnerable-range
limited overrides, finally exact patched versions. Never use unbounded global
ranges, advisory ignores or hand-edited lockfile integrity. pnpm must generate
lockfile changes normally. A successful update is distinct from a passing audit
and a verified frozen install; see the [current evidence](../evidence/2026-10-03-jump-0-3-hardening.md).
