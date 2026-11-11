# Jump の Vite+ 採用検討

記録日: 2026-11-12
状態: バックログ。採用・移行は未実施

## 目的と範囲

Jump のテスト・lint・format を Vite+ に統合できるか検討する。
別リポジトリの移行とは独立して判断・検証する。
この記録は移行実施、コミット、push、本番反映の指示ではない。

## 維持する構成

- Node と pnpm は mise で管理し、バージョン固定を維持する。
- 依存管理は pnpm を継続し、lockfile を更新・管理する。
- プロジェクトローカルの Vite+ を pnpm の scripts / exec 経由で利用する案を優先する。
- Wrangler、Playwright、既存の Worker 実行テストを維持する。
- Cloudflare 側の CD とデプロイ先の選択を、開発ツールの移行から切り離す。

## 残作業

- Jump の `AGENTS.md` にある Vite+ 禁止方針を、採用決定時に更新する。
- 採用時点の Vite+ 公式移行手順・対応 Node・同梱ツールのバージョンを確認する。
- 現行の Vite / Vitest / Oxlint / Oxfmt、coverage provider、型チェック、
  設定ファイル、pnpm catalog / override、CI への影響を整理する。
- グローバル CLI の環境管理を導入せず、mise と管理責務が重複しないことを確認する。
- format・lint 設定と test import の移行差分を確認し、不要な全面整形を避ける。
- 独立した feature ブランチで試し、採用可否を判断する。

## 完了条件

- format・lint・型チェック・単体テスト・既存のカバレッジ基準が成功する。
- E2E・Worker 実行テスト・Wrangler dry-run が成功する。
- テストを削減せず、検証強度やセキュリティ契約を維持する。
- pnpm frozen install と CI が再現可能に動く。
- README・AGENTS.md・CI を最終構成に揃え、実施した検証を evidence に残す。

## 参考

- [Vite+ 移行ガイド](https://viteplus.dev/guide/migrate)
- [Vite+ 環境管理](https://viteplus.dev/guide/env)

Status: implemented with Vite Plus 1.5.0; validation is recorded in evidence.
