# Hono rate-limit middleware

2026-11-24 に Rate Limit を Cloudflare dispatch から Hono middleware へ移行し、検証記録を作成。

## 動作

- request ID・セキュリティヘッダー、Origin・method・entry query の軽量検証の後、全 Hono ルートの前に Rate Limit を実行する。
- Cloudflare binding は各 request の env から取得する。未指定の `createApp()` は既存の unit test 用に limiter を省略できる。
- IPv4 は入力アドレスのまま、IPv6 は Away と同じ正規化で `/64` ごとにキー化する。
- 超過はローカライズ HTML の 429、`Retry-After: 60` と拒否監査ログを返す。binding 呼び出し例外は ADR 0009 に従い fail-open で skip ログを出す。binding 欠落・不正応答・不正 IP は 503 fail-closed。
- `wrangler.jsonc` の `run_worker_first: false` を維持し、静的ファイルは Worker 外で配信する。

## 検証

| コマンド                                                                 | 結果                                        |
| ------------------------------------------------------------------------ | ------------------------------------------- |
| `pnpm run format:check`                                                  | 成功                                        |
| `pnpm run lint:check`                                                    | 成功                                        |
| `pnpm run typecheck`                                                     | 成功                                        |
| `KNIP_DISABLE_RAW_TRANSFER=1 pnpm exec knip`                             | 成功、finding 0 件                          |
| `pnpm run test:cov`                                                      | 23 test files、2,127 tests 成功             |
| `pnpm run test:worker`                                                   | 成功、20 signed edges と limiter 契約を確認 |
| `env -u NO_COLOR pnpm run test:e2e`                                      | 成功、37 tests                              |
| `XDG_CONFIG_HOME=/tmp/umaxica-wrangler-config pnpm run cloudflare:check` | 成功、dry-run 280.88 KiB / gzip 68.73 KiB   |

カバレッジ: Statements 1151/1151、Branches 899/899、Functions 207/207、Lines 993/993（すべて 100%）。28 ファイルに未カバー箇所なし。
