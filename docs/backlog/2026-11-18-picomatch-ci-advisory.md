# CI の開発依存 picomatch の ReDoS 対応

2026-11-18 時点で対応判断待ち。

## 調査結果

`pnpm audit --json` は `picomatch@4.0.7` に High を1件報告した。
PR で変更できる設定やファイル名は Knip の glob 照合に届くため、CI の処理時間に影響し得る。
CI の停止は観測していない。本番構成の Wrangler ビルド入力134件に picomatch は含まれていなかった。
調査時点でアドバイザリに修正版の記載はなかった。[アドバイザリ GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)・[CI の Knip 実行箇所](../../.github/workflows/integration.yaml#L35)・[調査記録](../../evidence/2026-11-18-worker-security-review.md)

## 後日判断すること

判断時点のアドバイザリと `pnpm why picomatch` で、修正版の有無と導入元を確認する。
互換性のある修正があれば依存更新を検討する。更新を見送る場合は、PR の CI に残る影響と見送りの理由を記録する。
更新を採用した場合は、ロックファイルに影響バージョンが残っていないこと、対象の監査指摘が解消し、Knip と単体テストが通ることを確認する。
