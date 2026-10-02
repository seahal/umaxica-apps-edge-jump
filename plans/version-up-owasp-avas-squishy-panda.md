# バージョンアップ前 総合レビュー計画（OWASP ASVS 5.0 / ドキュメント / CI）

## Context

0.2.0 のバージョンアップ前に、OWASP ASVS 5.0 を基準にコード・ドキュメント・CI の問題点を洗い出して解消する。
受け入れテストは pre デプロイで実施済みなので、今回は静的レビュー、ローカルでの再現、CI 修正に絞る。
`pnpm audit` の失敗（CI の `dependencies` job）は対象外とする。

最新の main CI（run 37009096725）で失敗しているもの:

| Job                                     | 失敗内容                                                                               | 見込み                                                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| quality                                 | `format:check` で失敗（lint/typecheck/knip は未実行）                                  | 作業ツリーの lint/format 修正が未コミット。ローカルで再実行して確認する                                                     |
| e2e                                     | `e2e/smoke.spec.ts:144` で `//` パスを `request.fetch('//?rt…')` に渡し、`Invalid URL` | テスト側のバグ。`//` が protocol-relative URL として解釈されている。baseURL で絶対 URL を組み立てて修正する                 |
| worker-runtime                          | `workerd contract failed: ERR_ASSERTION`                                               | 未コミットの `scripts/test-worker.mjs` 差分（`cf: false`、`TEST_MISSING_IP`）が対処中と思われる。ローカルで再現して確認する |
| dependencies                            | `pnpm audit`                                                                           | **今回は対象外**                                                                                                            |
| unit / secret-scan / cloudflare-dry-run | 成功                                                                                   | —                                                                                                                           |

前回のレビュー（`evidence/2026-10-02-predeploy-asvs-review.md`）からの差分も確認する。とくに JWT の null 値で 500 になる Low の指摘について、修正済みかどうかを確かめる（`evidence/2026-10-02-jwt-json-root-validation.md`）。

## 方針（重大度の扱い）

- 重大度は CVSS 的な感覚で、迷ったら**厳しいほう**に付ける。
- **Critical**: 修正せずに報告し、判断をユーザーに仰ぐ（設計変更や鍵ローテーションなど、影響が大きいものを想定）。
- **High / Medium / Low / Info**: こちらで修正し、テストを追加する。ただし YAGNI を守り、推測に基づく抽象化はしない。
- 既存の未コミット変更は残したまま上に積む。コミットや push は承認を得るまで行わない。

## Step 1: ローカル基盤の確認

1. `pnpm install --frozen-lockfile` を実行する（前回の evidence では node_modules がなく、BLOCKED になっていた）。
2. `format:check` / `lint:check` / `typecheck` / `test` / `test:worker` / `test:e2e` / `cloudflare:check` / `knip` をすべて実行する。CI の失敗を再現し、ベースラインにする。

## Step 2: ASVS 5.0 に沿ったコードレビュー（本番スコープ: `src/cloudflare.ts`, `src/index.ts`, `src/core/*`, `src/config/*`）

| ASVS 章                                     | 主な確認対象                                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| V1 Encoding/Sanitization・V2 Validation     | `normalize_url.ts`（今回差分あり）、`idna.ts`、`escape.ts`、`page.tsx`                                         |
| V3 Web Frontend / V4 API・HTTP              | `security_headers.ts`、`public/_headers`、CSP ハッシュ、HEAD/メソッド処理、クエリの重複や配列（`rt[x]`）の扱い |
| V5/V8 Authorization（リダイレクト先の認可） | `policy.ts`、`registry.umaxica.ts`、自己参照や外部リダイレクトの禁止                                           |
| V9 Self-contained Tokens・V11 Cryptography  | `verify_jwt.ts`、`sign_outbound.ts`、`jump_jwks.ts`（alg / kid / typ / TTL / jti / 鍵ペアの検証）              |
| V12 Secure Communication・V13 Configuration | `fetch_jwks.ts`、`jwks_cache.ts`（SSRF、リダイレクト、サイズ上限、ネガティブキャッシュ）、`wrangler` 設定      |
| V16 Logging・Error Handling                 | `security_log.ts`、`public_error.ts`（トークンの非記録、例外が 500 になる経路）                                |
| Availability                                | `cloudflare.ts` のレート制限、`validClientIp`（今回差分あり）、`deadline.ts`                                   |

確認の手順: 該当コードを読み、疑わしい箇所があれば `test/app-fixture.ts` を使った一時的なプローブ（scratchpad に置く）で再現する。そのうえで vitest にテストを追加して修正する。

## Step 3: ドキュメントの整合性チェック

- `README.md`、`SECURITY.md`、`DESIGN.md`、`docs/**`、`adr/**` と実装を突き合わせる。対象は定数（TTL 300s / 30s、8192 文字、64 KiB、alg、ヘッダ値）、エンドポイント、エラーコード、ログ項目。
- 今回差分のある `docs/operations/key-rotation.md`、`origin-cutover.md`、`rollback-recovery.md` は、手順の実行可能性（コマンド、順序、ロールバック）まで確認する。
- バージョン表記（`package.json` の 0.2.0 と docs / ADR 0005）、リンク切れ、古い記述（`.aiassistant/rules/viteplus.md` など、AGENTS.md で禁止しているツールへの言及）を確認する。
- `.github/copilot-instructions.md` と `CONTRIBUTING.md` が AGENTS.md の pnpm 方針と矛盾していないかを確認する。

## Step 4: CI / リポジトリ衛生

- e2e: `smoke.spec.ts` の `//` ケースで、URL を `new URL(path, baseURL)` で組み立てるように直す。
- worker-runtime: 失敗している assertion を特定して修正する。
- quality: format / lint / knip を通す。
- `test-results/` が追跡対象になっている件: 削除をそのまま採用し、`.gitignore` に追加されているかを確認する。
- workflow の静的確認: actions が SHA で pin されているか、`permissions` が最小か、`persist-credentials: false` か。gitleaks に token を渡している範囲も見る。可能なら `actionlint` / `zizmor` を実行する（インストールなしで使える場合のみ）。

## Step 5: 修正と記録

- 指摘ごとに「重大度、ASVS 要件番号、再現手順、修正、追加テスト」を作業ログに残す。
- Critical があれば、その時点で作業を止めて報告する。
- 最後に `evidence/2026-10-02-version-up-asvs-review.md` を作成する（実施した内容だけを書く。`test/evidence-layout.test.ts` に準拠）。

## Verification

- `pnpm run format`、`lint`、`typecheck`、`test`、`test:worker`、`test:e2e`、`cloudflare:check`、`pnpm exec knip --include unlisted,unresolved,binaries` がすべて成功すること。
- 追加した回帰テストが、修正前のコードでは失敗し、修正後に成功することを確認する。
- CI の実機確認には push が必要なため、承認を得てから行う。その後 `gh run watch` で `dependencies` 以外が green になることを確認する。
