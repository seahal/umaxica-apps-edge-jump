# 鍵生成時の wrangler-secrets.json の誤コミット防止

2026-11-18 時点で対応判断待ち。

## 調査結果

鍵生成 CLI は秘密鍵を `private.pem` と `wrangler-secrets.json` に書き出す。
どちらもファイルモードは 0600 だが、生成先にリポジトリ内の通常のディレクトリを指定すると、
Git の除外規則が適用されるのは PEM だけになる。JSON は誤ってステージできる。
運用手順はリポジトリ外での生成を案内しており、調査時点で追跡中の同名 JSON は0件だった。[鍵生成 CLI](../../scripts/generate-jump-keypair.mjs#L71)・[除外規則](../../.gitignore#L182)・[鍵ローテーション手順](../operations/key-rotation.md)・[調査記録](../../evidence/2026-11-18-worker-security-review.md)

## 後日判断すること

生成物名 `wrangler-secrets.json` を `.gitignore` に追加するか判断する。
採用した場合は、実鍵を生成せず、任意のサブディレクトリにある想定パスで
`git check-ignore --no-index` を実行する。秘密 JSON は除外され、同じ場所の公開用 `public-jwks.json` は追跡可能であることを確認する。
