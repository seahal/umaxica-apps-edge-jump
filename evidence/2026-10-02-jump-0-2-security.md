# Jump 0.2 local security implementation evidence

Date: 2026-10-02 (Asia/Tokyo). Actual branch develop and unchanged HEAD/review baseline `5c82d5b3883840637481d13babfe5902db02f99a`. This is an uncommitted worktree verification, not an exact-commit or deployed-version verification.

## Scope and preservation

Initial changes preserved: removed `.vite-hooks/pre-commit`; Hono/node-server dependency upgrades and lockfile; workers-types catalog update; `test-results/.last-run.json`; the existing CI/dependency investigation evidence files. No reset/clean/checkout/stash, commit/push/PR, production credential retrieval, upload/deploy/rollback, secret rotation, DNS/Access/WAF/zone change or receiver repository change was performed. Existing production origin, active kid and public JWK values remain unchanged.

Plan and R01–R17 mapping: `plans/jump-0.2-security.md`. ADR 0005 supersedes current Fastly/Leap contracts; historical ADR content and previous evidence remain intact. Production has thirteen literal nodes, twenty edges, external disabled; schema 1 now requires reuse in both directions. Canonical origin and explicit active public key are required. Receiver-owned authentication/authorization/CSRF/transaction and downstream redirect validation are normative requirements, not guarantees supplied by Jump.

## Executed checks

Commands use pinned pnpm 12.0.0 and Node 24.20.0. A temporary wrapper disabled package-manager self-bootstrap and automatic dependency reinstallation during script execution; repository package-manager/trust policy was not changed. Only nonproduction WebCrypto-generated keys were used; no deterministic key-generation seed. Clock boundary fixtures use 1800000000 seconds.

| Command / check                                                                        | Exit | Observed result                                                                                                                     |
| -------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run test` baseline                                                               | 0    | 4 files, 211 tests passed                                                                                                           |
| Initial executable contract RED (`pnpm run test -- test/production-contract.test.ts`)  | 1    | 85 failed / 201 passed; script ran the whole suite                                                                                  |
| Stream cancellation / encoded control regression RED                                   | 1    | hanging reader timed out; encoded ambiguous URL was accepted before fixes                                                           |
| Final `pnpm run test`                                                                  | 0    | 7 files, 410 passed, no skips                                                                                                       |
| Final `pnpm run test:cov`                                                              | 0    | 410 passed; statements 93.41%, branches 89.59%, functions 95.14%, lines 95.56%; thresholds not lowered                              |
| `pnpm run typecheck`                                                                   | 0    | TypeScript noEmit passed                                                                                                            |
| `pnpm run lint:check`                                                                  | 0    | Passed; no fix-all invocation                                                                                                       |
| `pnpm run format:check`                                                                | 1    | Only preserved pre-existing `test-results/.last-run.json` fails; task files checked separately                                      |
| `pnpm exec knip --include unlisted,unresolved,binaries`                                | 0    | No dependency/entry errors; redundant-entry hint only                                                                               |
| `git diff --check`                                                                     | 0    | Passed after removing extra lockfile EOF newline                                                                                    |
| `pnpm run cloudflare:check --env-file /tmp/jump-empty.env`                             | 0    | Installed Wrangler 4.143.0 dry-run only; 282.27 KiB / gzip 68.35 KiB; no upload                                                     |
| `pnpm run test:worker`                                                                 | 1    | Actual Miniflare/workerd cannot start: listen EPERM 127.0.0.1; zero runtime cases executed                                          |
| `pnpm run test:e2e --output /tmp/jump-playwright-results`                              | 1    | Browser webserver cannot start: listen EPERM 127.0.0.1:4173; zero browser cases executed                                            |
| `pnpm install --frozen-lockfile --offline --store-dir /home/mslo/Projects/.pnpm-store` | 1    | Normal supply-chain policy verification lacks offline workers-types metadata; network attempts previously failed npm.flatt.tech DNS |
| Same pinned offline install with explicit `--trust-lockfile`                           | 0    | Restored exactly locked packages, including Fastly removal; does NOT prove normal metadata-policy verification                      |

The dry-run used an empty explicit env file, isolated CLI configuration directory, metrics disabled and Cloudflare credential variables unset. Installed help for versions upload/deploy and deploy was read; runbook commands were not executed. Lock pruning removes Fastly-only packages and promotes the already installed Wrangler Miniflare version for the real-runtime test; existing user upgrades are preserved. Some initial graph/rpl edits preceded executable RED because package-manager/harness failures blocked it. The complete change is not represented as perfectly test-first.

## Acceptance and mutation evidence

Independent test literals evaluate all 169 ordered pairs: exactly 20 allowed and 149 denied. All twenty allowed edges pass real distinct-issuer ES384 signatures, same-kid issuer isolation, fixed JWKS fetch, Worker adapter HTTP 302 and actual outbound signature verification on Node. This is adapter coverage, not actual workerd or Rails E2E. The six Base/Auth directions and twelve cross-TLD rejections have independent frozen expectations. The machine-readable receiver fixture is checked against every outbound claim set. Required rpl partitions, 8191/8192/8193 size, 299/300/301 TTL, 127/128/129 kid and 5-second skew boundaries, fractional NumericDates, URL/query/HEAD/config/key/limiter/failure/external/cache cases are covered by the seven test files.

In isolated `/tmp/jump-mutation` copies only:

| Mutation                                                       | Detecting tests                                                          | Result                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------- |
| Add Auth→Core edge                                             | literal graph and HTTP negative                                          | Exit 1: 2 failed / 183 passed                  |
| Remove both reuse checks                                       | rpl partition tests                                                      | Exit 1: 13 failed / 172 passed                 |
| Change limiter success to truthy, remove boolean shape check   | result-shape matrix                                                      | Exit 1: 3 failed / 182 passed                  |
| Restore runtime private export fallback (mapping, not mutated) | private-only bundle refuses; native exportKey spy; nonextractable import | Covered assertion paths; mutation not executed |
| Reuse one issuer key across issuers (mapping, not mutated)     | twenty distinct-key edges and foreign-key negative                       | Covered assertion paths; mutation not executed |

Temporary mutations are not present in the repository. No assertion/coverage removal or signature-verification mock was used to make crypto acceptance pass. Cache tests cover aborted shared refresh recovery, warm revocation, issuer/keyset separation and bounded failure entries; stream cancellation and delayed deadline completion remain fail-closed. Passing selected partitions does not prove every possible input or platform behavior.

Adding the evidence initially exposed a filename-rule failure (409 passed/1 failed): dotted `0.2` was renamed to hyphenated `0-2`. The rule and assertions were retained, and the final suite was rerun.

## Status and remaining gates

IMPLEMENTATION_STATUS: LOCAL_IMPLEMENTATION_COMPLETE / VALIDATION_PARTIAL. Browser/workerd and normal frozen-install metadata policy must run in an environment permitting localhost and registry metadata access; full format requires the owner to resolve their existing result-file change. ROLLOUT_STATUS: BLOCKED_FOR_ROLLOUT. No real canonical binding, receiver/issuer reuse readiness, live JWKS reachability, Worker version/config references, propagation/cache timing or compatible rollback artifact is verified. Previous 0.1 omits output reuse and is not an approved recovery target; waiting TTL does not fix continuing incompatible issuance.

Residual risks include limiter call-exception fail-open load exposure and shared-IP collateral limiting, reusable tokens requiring receiver transaction controls, trust in allowed-origin endpoint behavior, cached public keys delaying removal, and platform logging/WAF/zone response transformations. Existing dependency audit concerns were not resolved by a broad upgrade; this task did not run or claim a fresh online audit. The deployment owner must verify all live gates without exposing secrets.

## Revision manifest

Hashes below identify final task code/tests/config and documents; deleted paths are explicit. Existing evidence and pre-existing result/hook files are excluded from the content manifest but included where tracked in the full tracked-diff hash. This evidence document itself is excluded to avoid a recursive hash. Documentation may be committed later separately; code digest identifies the actually tested local artifact.

Tracked `git diff --binary` SHA-256: `44474c2900831b645b4734aefe61d7e47557bae00f18c3a15eb81d887cff2237`.

Code/tests/config manifest SHA-256: `44d738f0879f6a655f106add27f12b9bca08a1cd4948dc63bf19a7b48bc70eda`.

All task content manifest SHA-256: `19358e2ed88b25882beca5970f3d144366f7bbf13bdcbeae566f37bc480782f2`.

| Path                                          | SHA-256                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `README.md`                                   | `01540f576214acb46c2886397d6982d00d20afc5fd156b003d37ef6341b9ce4b` |
| `SECURITY.md`                                 | `06f8a8348fef9f23a009d3b7b6338e13bd56459a3762ba2d93feb816deb2d79f` |
| `adr/0001-no-static-asset-serving.md`         | `21f88aa5f4742ae50dbcd1d8428cc047fb2da23aa36708ab1b5539ee912f5f31` |
| `adr/0004-multiple-jump-implementations.md`   | `c912028bde972f500face4c09ddb6da67ce6047fc9f902eef73c66dea4014d3e` |
| `adr/0005-production-jump-0.2.md`             | `4a60ca08e9cf01e4ecb1fb31d61e567892a1a15c76d627b9991a40760264c389` |
| `docs/architecture.md`                        | `bcb70c4425330c5d636b263f620d5d521020017551178b453da6b281a810ed10` |
| `docs/compatibility.md`                       | `7c4f8a7f7325a7f5ca308c7837a541085790072ef878e0c5fbee45d3707dcf47` |
| `docs/decisions.md`                           | `b9feeaed78437ae9ebf4fcfa31ad26fa50a3d84f4ce31f9e76083e45de498586` |
| `docs/faq.md`                                 | `7ce8011b5cd6d13aa24f06e362085efc089defb690cb64b378fd493c0f334876` |
| `docs/glossary.md`                            | `2bf9ec9179416892e75595805a6ab473e79537df9c7deecd0d4c9ad1c2c2f7e1` |
| `docs/implementations.md`                     | `ac18f4c884f1472bd4686b1ded4d48043e4666a6640a52ea496caae5b47b1a11` |
| `docs/logging.md`                             | `11c257bf1624749b73de192ea11074947aaf00193cbea43c19be003837836733` |
| `docs/operations/key-rotation.md`             | `5bedf72a35c4a89e2773409084bdb311e0d8cfb15ac804c7f570cde4285120b1` |
| `docs/operations/production-configuration.md` | `42675ab59270065d560ce4d65b894e7236954442ffe63c376cbe9683ab244a59` |
| `docs/operations/schema-migration.md`         | `1e4bd0e3bc33a13f769f433d31546e8daebf99139ef61bcdb226301bb2ef6551` |
| `docs/protocol.md`                            | `9e1f614ed9fb5d5f2587dfdef5d01a4646664191c3fc143af04542400ff8973a` |
| `docs/receiver-contract.md`                   | `09a5fc1ddc93912a82f099ecf69f21154add56777194e0ba2e6bab41ff53f3df` |
| `docs/security.md`                            | `cddad61b80b37b05b708252db05a6998b237bc9766ed2c23f9d591ce94a5fdbb` |
| `docs/threat-model.md`                        | `3d9b25a552a34d11fa3a51610040e755a63ffc690b6d4f79c347a636995f9e3c` |
| `e2e/server.ts`                               | `e54f6f114677e6635e3450cd8ac2012734dfe1843bc26c34f05c8c4d32bdbaa7` |
| `e2e/smoke.spec.ts`                           | `d7f0e4f890aa94885a6913220d963e005b3249ef23246cbf601001e47a1e9e2a` |
| `fastly.toml`                                 | `DELETED`                                                          |
| `knip.json`                                   | `e23fc19f2df9c6c6f95b062dab0ea62ebe3168a6e65b46595263c2f2558f0593` |
| `package.json`                                | `e92a7e739ccccf320970cc6fe4b0863c23735af34fc679a9b74fa0eec7a16c07` |
| `plans/jump-0.2-security.md`                  | `8b5ada933a1b5a6dbdab0bca8365973b1998e3538efd9f6b6197abf704fed869` |
| `playwright.config.ts`                        | `e076ff554770c51062607d8d5bcf2cd52b9cb08173ffe9049d090f709708a54f` |
| `pnpm-lock.yaml`                              | `b446663335972ce4ada50bd8be7f7ae8e81537ccce538ac99296c6f936c5ec0f` |
| `pnpm-workspace.yaml`                         | `cf843394c3147300a6af6047cc629eb4f0eff9cfc22bb3594eeca5e2c73f261a` |
| `scripts/test-worker.mjs`                     | `944b6d1a7d0a8ae86edc0d539d20ea7d9388df49f0b4d5ef1550e6fd676e7148` |
| `src/cloudflare.ts`                           | `83ade90717fb0a162a42f7df2bc5aa27b68ce954cf71e77041047722a458185c` |
| `src/config/jwks.example.json`                | `DELETED`                                                          |
| `src/config/registry.example.ts`              | `DELETED`                                                          |
| `src/config/registry.umaxica.ts`              | `dd83c06bd23f89dc63e0c7ed92c1b557eef2638cc4f07b1cba86007973072977` |
| `src/core/deadline.ts`                        | `87469918407d774fa6d7bdc2231304cedda4b956ba2658122388cdb59be8152c` |
| `src/core/fetch_jwks.ts`                      | `3a5ad46c9ed713cc11c759afdcca6132fde9e758b19e60d702ad003006f9b106` |
| `src/core/handle_jump.ts`                     | `113e978d6a04455842256d03f8eabab5d75bef09a23caa0bd6a070337cdd5ee9` |
| `src/core/jump_jwks.ts`                       | `4f5752387a8e81baec1d6adc199a6990d3f86e116465c34997189fa2b77a4801` |
| `src/core/jwks_cache.ts`                      | `fecfb2ad0967c9811e471594163fd5ffd2932046c0d8b8d40f97b8ff461bc932` |
| `src/core/normalize_url.ts`                   | `48748217a857d0dc40cbe2c51c1e5e60c6157aff12181ad65541560aea93a4e3` |
| `src/core/page.tsx`                           | `a84a4dd97b62abac59d256fb3dd7050d835f92f643d150ddc0957421ca0efb52` |
| `src/core/policy.ts`                          | `da127210ebefe64e33bef781950d0be4fbdb6328783a56af557c9e3c75cd303c` |
| `src/core/render_about.ts`                    | `7cf02c3aec7e3cc76a8cf2f895b7d7cc714e22e0092305d08a88fef32437dc38` |
| `src/core/types.ts`                           | `20551b179cd1a9939dd3cd1353629ca38c5595b1fed992f359ecafcea18b6f5a` |
| `src/core/verify_jwt.ts`                      | `9a8e862f96fc0fb1320df2465e73d1875dd923cefa8043adc860feeb5367a452` |
| `src/fastly.ts`                               | `DELETED`                                                          |
| `src/index.ts`                                | `342b23755f0214aad98f995de4d51c2def0f17ee2217661b862cb8e475774bed` |
| `test/app-fixture.ts`                         | `949f277f2369f67377c5dcce57c1d4d240a110f0f727a044da816ca8e0a83435` |
| `test/cloudflare-key-material.test.ts`        | `d4bbfba4a8c4d000c5462ebc60fcb1e08adaddc9bc951a333621314b2c61ae8e` |
| `test/failure-concurrency.test.ts`            | `f38fa30e9e30b0fbbf400e844d9ffcddeec2387b0c55d9f1cb41b2d759e42dbc` |
| `test/fixtures/jwks.example.json`             | `684654f77f6508fdb258016534c6ef7a63d57df174b8a40a2c87bd697adfe7b1` |
| `test/fixtures/production-graph.json`         | `3e93ca422c35be5bb034d797ae61ddc9d0befcfd431ba12e3e859a43611588ab` |
| `test/fixtures/receiver-contract.json`        | `1eee2a36cba9785559fcd36fbd593c1b72c64b3b2c852c8e90ac3bf24f2fc35e` |
| `test/fixtures/registry.example.ts`           | `14d2c2841bd0c1571fba2eca5f7f9e62c27e26cb040a847c2e77ec219111b2fb` |
| `test/jump.test.ts`                           | `5adc069c117b3164225d6d0ff27fe9d91b02215aaeab491618e8e56f4760b91c` |
| `test/production-contract.test.ts`            | `346f0d3a0236f2a646d4c5ea3ba86aafb3c7cd2e153d900edb491bc94d84d4f5` |
| `test/security-hardening.test.ts`             | `6f22080ebd593359c403f3b4b0ede209e8ee2bc98916cd99acdff818f8c5cfc7` |
| `test/token-boundaries.test.ts`               | `09eeefed397fdf6c4f3ce7799d8261ca805df312aa75325404022360b9327f2b` |
| `wrangler.jsonc`                              | `552b258509f58cf2b4c93dbe847dc3fd90bde25ba66455da91cb96ad6e8d38ce` |
