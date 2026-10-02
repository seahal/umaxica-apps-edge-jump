# Jump は「1 つのプロトコル・複数の実装」であることを文書化する

## Context

これまで test / dev / prod を `jump.umaxica.net` 上の Hono 実装 1 本で賄ってきたが、
Rails をローカル開発する際に到達可能な Jump サーバーが無いと開発が回らず、限界が来た。
Rails 側に dev + test 専用の Jump 実装（Cloudflare 版を参考）を作り、
Cloudflare Tunnel `leap.umaxica.net` で公開する（`jump.umaxica.net` は既に使用中のため）。
issuer 側は環境変数で Jump の URL を切り替え、production では必ず Hono 版を使う。

結果として「Jump のインターフェイス（`GET /?rt=<JWT>` + JWKS + 応答挙動）を
実際に話す実装が複数存在する」状態になる。これを ADR / docs / README に明記する。

ユーザー確認済みの前提:

- **正本はこのリポジトリの Hono 実装**（production first）。Rails 版は追従する非本番実装。
- Rails 内の surface 名（`jump`）や環境変数名は Rails 側の事情であり、**Hono 側は知らなくてよい**。
  よってこのリポジトリには書かない（「issuer が環境設定で Jump base URL を選ぶ」とだけ書く）。

## 変更内容（ドキュメントのみ、コード変更なし）

### 1. 新規 `adr/0004-multiple-jump-implementations.md`

既存 ADR（`adr/0003-*`）と同じ構成: Status / Context / Decision / Consequences。

- **Context**: 単一 Hono デプロイで全環境を賄う限界（ローカル Rails 開発に到達可能な Jump が必要、
  Tunnel ホスト名 `jump.umaxica.net` は本番で使用中）。
- **Decision**:
  - Jump は「プロトコル」であり、実装は複数ありうる。**正本（reference implementation）は本リポジトリの Hono 実装**。
    挙動の食い違いは常に Hono 側が正しく、他実装が直す。
  - 実装一覧（表）:
    | 実装                                                        | ホスト                                  | 環境                             | 位置付け                 |
    | ----------------------------------------------------------- | --------------------------------------- | -------------------------------- | ------------------------ |
    | Hono / Cloudflare Workers                                   | `jump.umaxica.net`                      | production                       | 正本・唯一の本番経路     |
    | Hono / Fastly Compute                                       | —                                       | 実験                             | 非本番（既存記述どおり） |
    | Hono ローカル (`cloudflare:dev` 5209 / `fastly:serve` 7676) | `127.0.0.1`                             | 本リポジトリの開発               | 正本のローカル実行       |
    | Rails 内蔵実装（Cloudflare 版準拠）                         | `leap.umaxica.net`（Cloudflare Tunnel） | Rails の development / test のみ | 非本番の互換実装         |
  - issuer は環境設定で Jump base URL を選ぶ。production の値は `https://jump.umaxica.net` 固定。
  - 非本番実装の禁止事項: production で起動・到達してはならない／本番の署名鍵・`kid` を共有しない／
    本番 registry・本番 receiver は `leap.umaxica.net` の JWKS を信頼しない／
    `leap.umaxica.net` を本番の宛先 allowlist に入れない。
- **Consequences**: 実装間ドリフトのリスク、互換性の基準は本リポジトリの docs とテスト、
  新しい挙動はまず Hono に入れてから他実装へ、`leap` 側の不具合は本リポジトリの SECURITY 範囲外。

### 2. 新規 `docs/implementations.md`（インターフェイス／実装の対応表）

- 「インターフェイス」の定義＝外部から観測できる契約: `GET /?rt=`、JWT `schema: 1` の claim、
  `/.well-known/jwks.json`、`/health.json`、エラーコードと HTTP ステータス（400/503 の区別）、
  internal=302 / external=cushion、セキュリティヘッダー。各項目は既存 docs（`security.md`、
  `logging.md`、`compatibility.md` 等）へリンクし、内容は重複させない。
- 上記の実装表（ADR と同じもの）と、環境 → Jump base URL の対応（production=`jump.umaxica.net`、
  dev/test=`leap.umaxica.net`）。
- 「receiver は Jump の JWKS を Jump base URL から引くので、URL 切替時は JWKS の取得先も一緒に変わる」旨。
- ADR 0004 へのリンク。

### 3. `README.md`

- 冒頭 "Hono-only" の表現を「**正本は Hono 実装。production は Hono のみ**」に修正。
- `## Interfaces And Implementations` セクションを追加: 実装表の要約（4 行）＋
  「production では Hono 版以外を使ってはならない」＋ `docs/implementations.md` / ADR 0004 へのリンク。
- `## Detailed Docs` に Implementations を追加。

### 4. 既存 docs の小修正

- `docs/decisions.md`: "Why Hono Only?" を「production が Hono only である理由」に寄せ、
  新項目 "Why A Non-Production Rails Implementation?"（理由 + ADR 0004 リンク）を追加。
- `docs/architecture.md`: Active-Active Edge の後に短い "Implementations" 段落と docs/implementations.md へのリンク。
- `docs/glossary.md`: `reference implementation`、`non-production implementation`、`leap`（`leap.umaxica.net`）を追加。
  `jump` の定義に「正本実装は本リポジトリの Hono」を補足。
- `docs/operations/production-configuration.md`: 本番前チェックに
  「issuer の production 設定が `https://jump.umaxica.net` を指す／`leap.umaxica.net` を参照しない」を追加。
- `SECURITY.md` Scope の Out of scope に「`leap.umaxica.net` 上の非本番 Rails 実装（Rails リポジトリ側で扱う）」を追加。

## やらないこと（YAGNI）

- Hono 側のコード変更（`leap` を拒否するガード等）は入れない。現行 registry は `leap` を一切信頼しておらず、文書の禁止事項で足りる。
- Rails 側の環境変数名・surface 名・実装詳細は書かない。
- evidence は作らない（検証・監査ではなく設計文書の追加のため）。

## Verification

- `pnpm run format`（oxfmt で md の表を整形）
- `pnpm run lint:check` / `pnpm run typecheck` / `pnpm run test`（`test/evidence-layout.test.ts` を含む。コード変更が無いので既存結果が維持されることの確認）
- 追加・変更した相対リンク（`adr/0004-*`、`docs/implementations.md`）が実在するパスを指すことを `grep` で確認。
