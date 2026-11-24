# Security and contract remediation

2026-11-24 に実施したセキュリティ強化、応答契約の修正、デッドコード整理の検証記録。

## 変更内容

- 公開 JWKS は許可属性のみで再構築し、`kid` は制御文字も検証する。
- OAuth クエリ名と重複禁止キーの判定を case-insensitive にし、OAuth redirect URI のスキームを HTTPS、redirect 用 loopback HTTP、RFC 8252 形式の private-use scheme に限定する。
- Cloudflare の拒否・障害ログを構造化し、request ID、拒否結果、HTTP status を付与する。429 に `Retry-After: 60` を追加する。
- 未知パスとクエリなし `/` は 404 に統一し、前段と後段で同じ Accept-Language 判定を使う。
- 指定された未使用コード、経路ルールの no-op、冗長な Knip エントリを削除し、`/about` 統合を backlog に記録する。

## 検証結果

| コマンド                                                                 | 結果                                                  |
| ------------------------------------------------------------------------ | ----------------------------------------------------- |
| `pnpm run format:check`                                                  | 成功（208 files）                                     |
| `pnpm run lint:check`                                                    | 成功                                                  |
| `pnpm run typecheck`                                                     | 成功                                                  |
| `KNIP_DISABLE_RAW_TRANSFER=1 pnpm exec knip`                             | 成功、警告なし                                        |
| `pnpm run test:cov`                                                      | 成功（22 files、2090 tests）                          |
| `pnpm run test:worker`                                                   | 成功（20 signed edges を含む契約検証）                |
| `env -u NO_COLOR pnpm run test:e2e`                                      | 成功（36 tests）                                      |
| `XDG_CONFIG_HOME=/tmp/umaxica-wrangler-config pnpm run cloudflare:check` | 成功（Wrangler dry run、278.67 KiB / gzip 68.14 KiB） |

カバレッジは Statements 1137/1137、Branches 885/885、Functions 202/202、Lines 980/980（すべて 100%）。27 ファイルに未カバー箇所なし。
