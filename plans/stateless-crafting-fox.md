# favicon.ico を sibling repo から取り込む

## Context

前タスク（HTML `<title>` の UMAXICA Title Contract 統合）は実装・検証済み。その報告に対し、この領域は
`../umaxica-apps-edge` および `../umaxica-apps-global` と密接に連携するため、迷ったらそれらの実装を見るべき、
との指摘を受けた。今回はそのうち **favicon.ico の取り込みのみ**を実施する。他の連携事項は別途会話する。

**現状の問題**: edge-jump の `/favicon.ico` は `src/index.ts:88` で `c.body(null, 204)`、つまり
「アイコンは存在しない」を返している。一方 sibling の全 apex は同一の favicon を配信しており、
`jump.umaxica.net` だけがブラウザタブでアイコンなしになる。

### 調査結果 — sibling の実装

`../umaxica-apps-edge/{net,app,com,org}/apex/public/favicon.ico` は **4 つとも byte 単位で同一**
（md5 `cdb5f6526b9cab807d58f5cbfc4e5ab6`、5430 bytes、真正の ICO = magic `00 00 01 00`、32x32 + 16x16 の 2 icon）。
これが UMAXICA edge の正本。

配信方式は `wrangler.jsonc` の `"assets": { "directory": "./public" }` + `public/favicon.ico`
（`../umaxica-apps-edge/net/apex/wrangler.jsonc`）。

`../umaxica-apps-global/public/favicon.ico` は **中身が PNG（48x48）で拡張子だけ .ico** という別物
（md5 `4414e926...`、1206 bytes）。正本としては採用しない。

## 変更方針

sibling と同じ `public/` + wrangler assets 方式を採用する（ユーザー選択）。

### 1. `public/favicon.ico` を追加

`../umaxica-apps-edge/net/apex/public/favicon.ico` をコピーする。
jump は `jump.umaxica.net` なので TLD が一致する `net/apex` を出典とする
（4 apex とも同一 byte なのでどれを選んでも結果は同じ）。

`.gitignore` の `public` はコメントアウト済み（`.gitignore:114`）なので追跡される。
`git check-ignore` で確認済み。

### 2. `wrangler.jsonc` に assets を追加

```jsonc
"assets": { "directory": "./public" },
```

`binding` は不要（Worker から参照しないため）。静的 asset は Worker より先に評価されるので、
Cloudflare 上では `/favicon.ico` がこのファイルで応答する。`public/` には favicon.ico しか置かないため、
他 route（`/about`, `/health`, `/robots.txt`, `/sitemap.xml`, `/.well-known/jwks.json`）への影響はない。

### 3. `src/index.ts:88` の 204 route は**残す**

削除しない。理由: edge-jump は Cloudflare / Fastly / Node の 3 runtime で同じ `createApp()` を共有しており、
wrangler assets は Cloudflare 限定。route を消すと Fastly と Node (e2e) で `/favicon.ico` が
前タスクで追加した **HTML 404 ページ**に落ちてしまい、アイコン要求に HTML document を返すことになる。
残しておけば Cloudflare は asset、Fastly/Node は現行どおり 204 で、いずれも regression なし。

この非対称性はコメントで明示する。

### 4. `<link rel="icon">` は追加しない（ユーザー選択）

`src/core/page.tsx` の `renderDocument` は変更しない。ブラウザは既定で `/favicon.ico` を取得するため
表示自体は成立する。sibling の `renderer.tsx:15` には `<link rel="icon" href="/favicon.ico" />` があるので、
head 構成を揃えたくなった時点で別途対応する。

## Tests

`test/jump.test.ts` に asset の存在確認を 1 test 追加する（vitest は node 環境なので `node:fs` が使える）。
sibling repo のパスに依存させない — このリポジトリ内で完結させる。

- `public/favicon.ico` が存在する
- サイズが 0 でない
- 先頭 4 byte が ICO magic `00 00 01 00`（PNG や空ファイルの取り違えを検出する）

既存の `/favicon.ico` 204 テストは**変更しない**（Fastly/Node 挙動として正しいまま）。

## Verification

```
vp test run                 # 既存 109 + 新規 1
vp check                    # fmt / lint / typecheck
vp run cloudflare:check     # wrangler deploy --dry-run
```

`cloudflare:check` の出力に assets が計上され、`dist/cloudflare` に favicon が含まれることを確認する。
`md5sum public/favicon.ico` が `cdb5f6526b9cab807d58f5cbfc4e5ab6` であること、
`file public/favicon.ico` が `MS Windows icon resource - 2 icons, 32x32 ... 16x16` を返すことも確認する。

e2e (`vp run test:e2e`) は Node サーバー上で走るため `/favicon.ico` は 204 のまま。既存 9 test が無変更で通ること。

## Scope 外（今回やらない / 別途会話する）

- `public/_headers` — sibling は CSP 等を `_headers` で asset にも付けているが、edge-jump の
  `jumpSecureHeaders()` middleware は Cloudflare の asset response には乗らない。favicon 単体では
  低リスクなので今回は入れない。要検討事項として残す。
- `manifest.webmanifest` / `service-worker.js` / `robots.txt` / `sitemap.xml` の public 化 — edge-jump は
  robots/sitemap を Hono route で jump 固有の内容（`Disallow: /` + `Allow: /about`）として返しており、
  sibling の静的版とは意図的に異なる。触らない。
- `umaxica-apps-global/public/favicon.ico`（実体 PNG）との不一致 — 正本がどちらか別途確認が必要。

## 別途会話したい重要な発見（今回は実装しない）

前タスクの報告で「`SeoHead` / `buildBrandTitle` / `brand.ts` はこのリポジトリに存在しない」と述べたが、
**sibling には存在する**:

- `../umaxica-apps-edge/net/apex/src/brand.ts` — `buildBrandTitle()`, `DEFAULT_BRAND_SEPARATOR = ' — '`,
  `BRAND_TLD = 'NET'`, `getBrandName(env)`, `brandFromEnv(c)`（`BRAND_NAME` / `BRAND_SEPARATOR` /
  `BRAND_TLD` / `BRAND_DEFAULT_TITLE` の Worker vars を読む）
- `../umaxica-apps-edge/net/apex/src/seo.tsx` — `SeoHead`, `setMeta`, `getMeta`

`brand.ts` のコメントは「Each frame owns its own copy of this module」と明記しており、frame ごとの複製が
意図された設計。今回 edge-jump に入れた `brandTitle()`（`src/core/page.tsx`）は意味論としては同一
（root / page、EM DASH、page-first、TLD 大文字）だが、**関数名・signature・env var 対応が sibling と違う**。

揃えるなら `src/core/page.tsx` の `brandTitle()` を sibling と同形の `src/core/brand.ts`
（`buildBrandTitle` + `BRAND_TLD` + `brandFromEnv`）に置き換えるのが筋。ただし edge-jump は
`BRAND_NAME` 等の Worker vars を持たず、TLD を FQDN から導出している差異があるため、
どこまで揃えるかは要相談。
