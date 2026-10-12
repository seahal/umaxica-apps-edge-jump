# UMAXICA Jump 0.4.0 の転送先パス境界と設計判断

- **文書種別**: セキュリティ設計判断・実装目的説明（実装完了報告ではない）
- **策定日**: 2026-10-11（JST）
- **対象**: `umaxica-apps-edge-jump`（Hono / Cloudflare Workers）
- **対象リリース**: 0.4.0 のセキュリティ改修
- **対象外**: Railsコード変更、Rails側JWKS負荷問題の修正、本番デプロイ、Awayの実装
- **状態**: ローカル実装の設計正本。実行結果は日付付き evidence を参照。実workerdとRails相互運用を含むリリース条件は未充足。

## 1. この改修は何のために行うのか

**今回の目的は、`/sign/out.html/`という一つの文字列を拒否リストへ足すことではない。**

Jumpと受信側Railsが、同じHTTPリクエストのパスを異なる規則で解釈し得る状況において、**Jumpが「禁止経路ではない」と判断したパスをRailsが禁止対象と同じ経路として処理する余地を閉じること**を目的とする。

Jumpは、Railsが作成した署名付きRedirect Token（RT）を検証し、許可されたUMAXICA内部Originにのみ、新たなRTを付けて302で遷移させる。署名とOriginの検証は必要だが、**許可済みOriginのあらゆるpathnameの安全性を保証するものではない**。Origin Allowlistの内側には、再転送やセッション操作のように、Jumpが直接遷移先として認めるべきでない経路が存在し得る。

本改修により、以下を実現する。

1. 禁止された経路を、末尾スラッシュ・フォーマット拡張子・符号化・区切り文字の差異で回避させない。
2. WHATWG URLの正規化だけに依存せず、正規化前の危険な表現も拒否する。
3. 危険なものはURLを修復・書き換えて受け入れるのではなく**fail closed**で拒否する。
4. 既存の署名検証、13ノード/20許可辺/149拒否組、HTTPS限定を一切緩和しない。
5. 正当なOAuth/OIDC値を壊さないよう、**直接pathnameの検証とクエリー値の検証を分離**する。
6. Railsの実装を変更できない期間であっても、Jump単独の防御を改善・検証できるようにする。

## 2. システム上の位置と信頼境界

```text
Rails 発行側
  │  署名付き RT（iss / aud / dst / url / exp 等）
  ▼
https://jump.umaxica.net/?rt=...
  ├─ 入口のHTTP/Fetch Metadata/Rate Limiting
  ├─ JWT形式・署名・kid/JWKS・有効期限・発行者を検証
  ├─ dst == internal と発行者→宛先Originの有向グラフを検証
  ├─ 【今回】直接pathnameの構文と正規化前後の曖昧性を検証
  ├─ 【今回】Origin別の禁止経路を、別表現も含めて照合
  ├─ 既存のクエリー検証・RT混入検証
  └─ 合格時のみ新しい署名付き RT を作成し 302
  ▼
Rails 受信側
  ├─ Jumpの署名・aud・src・URL結び付き・有効期限を独立に検証
  ├─ RTを除去した同一ホストURLへ所定の303
  └─ アプリケーション本来の認証・認可・CSRF/状態検証
```

**信頼してよいこと**: 正しく署名されたRTが、登録済み発行者の意図を表すこと。**信頼してはいけないこと**: RT中の`url`がRails上の安全な操作・経路を必ず指すこと。発行側がユーザー制御値を反映する可能性や、受信側のルーティングとJumpの解析差異が残るためである。

Rails受信側によるRT検証や本来の認可は、Jumpでの許可判定によって省略できない。本改修はRails側の安全性を代行したり、Rails側の脆弱性を修正したりするものではない。

## 3. 監査で発見された事象と、確認されていない事柄

2026-10-11に共有されたローカル監査報告では、現在の作業ツリーにある禁止経路ポリシーに対し、次を観測した。

| 直接転送先pathname | 報告されたJumpの動作                  |
| ------------------ | ------------------------------------- |
| `/sign/out.html`   | 拒否                                  |
| `/sign/out.html/`  | **拒否をすり抜け、署名付き302を発行** |

元監査では、12 OriginでURL検証関数の受け入れを確認し、Auth APPからBase APPへの署名付きHonoリクエストで302を確認した。
本改修の回帰テストは、12 Originすべてに実際の許可辺を選んで署名付きリクエストを送る。監査では、既存の1,307件のテストが成功した一方、追加の境界ケースが問題を露呈した。

**確認済みと扱う範囲**: 共有監査における「Jump独自の禁止経路ルールを別表現で回避した」という再現結果。**未確認**: そのURLが実際の稼働Railsにおいてログアウトアクションに到達すること、認証検証を突破すること、任意外部OriginへのOpen Redirectが成立すること。これらを証明したかのような脆弱性説明を禁止する。

根本原因として疑うべきは、単なる末尾スラッシュの見落としではなく、**受け側ルーターによる経路の等価性とJumpの拒否ルールの境界がずれていること**である。元監査が確認したローカルRailsソース `a19f07f3502f` と公式upstreamの `ActionDispatch::Journey::Router::Utils.normalize_path` は末尾の `/` を除去し、連続する `/` を整理する。
対象Railsのlockfileが指すrevisionは `48dc419a790893357ba0c4b49ed6c4d043dbeb9c` であり、その正確なrevisionでの実行は未確認である。これを根拠に、Railsの別表現を検証対象に含める。ただし、実際のUMAXICA Railsのバージョン、middleware、route定義での到達先は別途確かめる。

今回の対応を「`/sign/out.html/`だけ追加して修正完了」とはしない。別の拡張子、末尾スラッシュ、区切り、エンコードによる同種の問題がないか検証する。

## 4. 脅威モデル

### 想定する攻撃条件

- Jumpへ直接HTTPリクエストを送れる者は多数存在するが、**有効なES384発行者署名がなければ通常の302へ進めない**。
- 脆弱な発行元がユーザー入力を`url`に取り込んだ場合、あるいは発行元が侵害・誤実装された場合、許可済みOrigin内の禁止経路を含むRTが発行され得る。
- 受信側Railsはpathnameを正規化・ルーティングするため、Jumpで比較した表現と最終処理が一致するとは限らない。
- 攻撃者が鍵を所有していること、既に署名を破れること、実際にRailsの認証を突破することは前提にしない。

### 防ぎたい失敗

1. **拒否経路の等価表現回避**: `path`、`path/`、`path.format/`が異なる文字列として扱われる。
2. **正規化による情報消失**: パース後だけを見ると`..`等の危険な入力表現が消える。
3. **粗い前方一致**: `/sign/out`を禁止したいのに、`/sign/outbox`を巻き込む／または意味のある区切りを見落とす。
4. **クエリーの誤判定**: pathnameの検査をURL全体にかけ、`state=a%5Cb`のような有効なOAuth値を拒否してしまう。
5. **検証前の副作用**: 禁止経路を判定する前に新規RTを署名する、成功ログや`Location`を生成する。

### あえて保証しない範囲

- Rails内の未知のすべての危険経路の自動発見。
- Rails内部で発生し得る再転送の完全な排除。
- Rails側の認証、認可、CSRF、state、nonce、一回性等の代替。
- Rails受信側の未知`kid`によるJWKS再取得負荷への対策。
- 本番Cloudflareの実デプロイ版と設定が改修済みであることの保証。

## 5. 設計原則と選択理由

### 5.1 三層構成

**第1層: Origin Allowlist（従来の正本を維持）**。受信RTの発行者と宛先を検証し、13 Origin・20有向辺以外を拒否する。Denylistによって許可を追加する機能は設けない。

**第2層: Path Syntax Policy（直接pathnameのみ）**。入力の構文と正規化による曖昧さを拒否する。対象はJWTの`url`が指す直接のpathnameであり、クエリー値に含まれる別URLのパスを再帰的に処理しない。既存の安全なHTTPS/host/userinfo/port等の検証は維持する。

**第3層: Origin別Route-aware Denylist**。既知の危険な内部経路を拒否する。基本経路、末尾スラッシュ、必要に応じてRailsのformat表現や配下セグメントを、**明示的な照合規則**で保守する。

クエリーの`next`、`return_to`等の間接転送検証と、明示的な禁止ドメインは独立した規則として維持する。単純な文字列探索で`state`等の値を禁止対象と判定しない。

### 5.2 「正規化して許可」より「曖昧なら拒否」

URL全体を`decodeURI`して判定する実装は不可。かつて正常なOAuth `state=a%5Cb`を誤拒否した理由であり、直接pathnameとクエリーの境界を崩してしまう。

実装では、`new URL()`の解析結果をOrigin等の信頼判断に用いる一方、**署名付き`url`の元の直接pathnameに何が記述されていたか**を安全に保持して検証する。元パスを抽出できない曖昧な形式は拒否する。単純な文字列splitによるOrigin判定や、復号済みの危険文字を消して安全なURLへ書き換える処理を行わない。

直接pathname中の`//`、バックスラッシュ、区切り文字の符号化（`%2F`、`%5C`）、多重符号化疑い（`%25`）、曖昧なdot-segmentや`;`等は保守的に拒否する。判定基準は既存の合意を尊重し、何が拒否されるかを個別テストで固定する。

### 5.3 禁止経路の境界

Originごとのルールは次の意味を明確に区別する。

- **完全一致**: 登録したpathnameそのもの。
- **形式差を考慮した一致**: `path/`、`path.html/`、`path.json/`等、該当Rails経路と同一であるか安全上疑わしい別表現。拡張子の種類だけに依存しない設計とする。
- **セグメント境界付き前方一致**: `path/child`などを必要に応じて拒否する。ただし`pathology`や`pathbox`を単純な前方一致で巻き込まない。

**特定のRailsルーターの全機能をHonoに複製しない。** これを行うと、Railsのアップグレードで再び解釈差が生まれ得る。Jumpは保守的な構文拒否と明示的な禁止経路の整合性を責務とする。

### 5.4 対象の不変条件

- 拒否は非3xx、`Location`なし、Cushionなし、Awayへのフォールバックなし、新規RT署名なし。
- 許可される遷移は引き続き302、新規署名RTを1つ付加する。
- `dst: internal`を必須とし、`external`その他の値を受け入れない。
- Schema 1、ES384、発行者JWKS、TTL、鍵失効、rate limit、fetch metadata、deadline、セキュリティヘッダーに後退がない。
- RFC 6749/9700に適合する正当なOAuth状態パラメーターや登録リダイレクトURIを、一律のpathname構文検査で破壊しない。

## 6. 具体的な検証例

以下の一覧は**実装後の期待契約**であり、この文書作成時点での試験結果ではない。試験は本番ではなく、隔離された非本番のES384鍵・mock JWKS・Hono/Workers上で行う。

| 対象                                | 期待結果・確認内容                                               |
| ----------------------------------- | ---------------------------------------------------------------- |
| `/sign/out`                         | Origin別Denylistで拒否                                           |
| `/sign/out/`                        | 拒否（末尾スラッシュによる回避不可）                             |
| `/sign/out.html`                    | 拒否（format差分）                                               |
| `/sign/out.html/`                   | 拒否（今回の再現対象）                                           |
| `/sign/out.json/`                   | 拒否（別format）                                                 |
| `/sign/out%2Ehtml/`                 | 拒否（曖昧な符号化）                                             |
| `/sign/out//`                       | 拒否（不正な空セグメント）                                       |
| `/sign/out;anything`                | 拒否（パス中の曖昧な`;`）                                        |
| `/sign/outbox`                      | 少なくとも`/sign/out`ルールに誤一致しない。他の規則は別途適用    |
| `/articles/example.html`            | 他の全条件に合格すれば302可能                                    |
| `/oauth/authorize?state=a%5Cb`      | 直接pathnameに問題がなければ`state`を保ち、他の条件次第で302可能 |
| 直接pathname中の`%2F`・`%5C`・`%25` | 拒否                                                             |
| 許可されないOrigin/辺               | パスに関係なく拒否                                               |
| 正しい署名のある禁止経路            | **新規署名関数を呼ばず**拒否、`Location`なし                     |

すべての登録禁止Originで問題を再現した組合せを検証する。「対象の12 Origin」とされた集合は、現在のローカルRegistryとDenylistの実体を再確認して固定する。13ノード/20辺のグラフは変更しない。

### テストレベル

1. **ポリシー単体**: Denylistのエントリーが実際に作用していることを確認する。Origin Allowlistの先行拒否だけで、Denylist自体を合格扱いにしない。
2. **Hono統合**: 合法な署名RTを入力し、宛先が禁止の場合は非3xx/Locationなし/署名0回、許可の場合は正しい302と再署名RTを確認する。
3. **workerd**: Cloudflareアダプターで同じ判定とセキュリティヘッダーを確認する。
4. **Rails側相互運用（後日）**: Railsルーティング結果、JWT検証、URL比較、30秒TTL、正常なログアウト遷移との整合を別案件として検証する。

新しい拒否テストに加え、合法な`state=a%5Cb`、通常の`.html`パス、20許可辺、149拒否組の**肯定的回帰**を必須とする。拒否を強化して正常な遷移がすべて失敗する実装は不合格。

## 7. 改修対象と対象外

| 対象                                                        | 方針                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/core/normalize_url.ts`                                 | raw pathnameとWHATWG正規化後の境界検証。クエリーから分離          |
| `src/core/redirect_policy.ts`（ローカル候補に存在する場合） | Origin別の禁止経路とformat/末尾スラッシュの照合。既存の構成を尊重 |
| `src/core/policy.ts` / `handle_jump.ts`                     | 署名より前に完全な宛先検証を保証                                  |
| `test/redirect-path.test.ts`等                              | RED→GREENの署名付き境界試験と正当系の回帰                         |
| `docs/redirect-policy.md`等                                 | 本文書へのリンク、実装済み契約、制約を整合                        |
| `evidence/`                                                 | 実行した検証だけをSHA、コマンド、結果つきで記録                   |
| Railsリポジトリ                                             | **今回変更しない**。後続チケットで修正                            |

未コミットの実装ソースはGitHubのROコピーと一致するとは限らない。**Sol 6.1等の実装AIは、必ず自身がアクセスしているローカル作業ツリーを先に確認**し、既存の差分を保護すること。上記パスが存在しない場合、古いGitHubコードへ勝手に実装を置き換えてはいけない。

## 8. Rails側JWKS負荷問題との切り分け

同じ監査で、Rails受信側は未知の`kid`を使うRTの検証に際し、鍵取得先単位のリフレッシュ間隔制限が不足し、共有JWKSキャッシュを削除して再取得する可能性が指摘された。署名が不正なRTであっても、検証過程のネットワーク・キャッシュ負荷を攻撃者が増やせるおそれがある。

**これはHonoでは修正できない。** RailsのRT入口への直接アクセスはJumpを通らずに発生するため、JumpのRate Limitingを強めても解決しない。本改修ではRailsのコードを変更せず、**独立したP0のリリース阻害要因として記録し、後で修正・検証する**。実環境の攻撃成立、サービス停止、影響度は未実証として扱う。

### Rails後続チケットの必須項目

- RTのJWKS取得より前の負荷制限。
- 更新制御を未知`kid`単位でなくJWKS取得先単位へ変更。
- 同時取得の抑制と、正常キャッシュを削除しない更新方式。
- 未知`kid`の負キャッシュ容量制御。
- 鍵の事前公開・失効・ローテーション・障害時Fail-closedの回帰試験。
- Jump→Rails URL照合、TTL、実際のルーティング互換性の統合試験。

## 9. 完了基準とリリース判断

**Honoローカル改修を完了とするための条件**:

- 再現した`/sign/out.html/`を含む全パス変種が、実際のOrigin別Denylistで拒否される。
- 正当なOAuth/OIDCと通常パスが引き続き通る。
- 20許可辺・149拒否組を維持する。
- 拒否時にはLocationも新規RT署名もない。
- Vitestと実workerd試験が候補SHAに対して合格し、必要なCSP/セキュリティヘッダーを維持する。
- 新しい仕様と古い設計文書、テスト契約に矛盾がない。
- セキュリティ審査で見つかった未解決事項は隠さず別途明示する。

**本番リリース可能とするための条件はこれより厳しい。** 実候補のCI、Cloudflare本番Bindings、検証済み不変ロールバック成果物、Rails側のJWKS可用性対策・受信契約、およびADR 0007の本番段階的移行条件が必要になる。本番で未検証のものをPASSにしない。現在の設計文書は実装完了またはデプロイ完了を意味しない。

## 10. 参照資料・変更履歴の保持

- 2026-10-11 ローカル監査: `evidence/2026-10-11-asvs-jump-rails-audit.md`（今回も読み直して確認済み）
- Jump: `adr/0007-remove-external-destinations.md`、`docs/security.md`、`docs/receiver-contract.md`、`docs/redirect-policy.md`（存在する場合）、`test/redirect-path.test.ts`（存在する場合）
- Rails公式upstream（稼働revisionの証明ではない）: https://github.com/rails/rails/blob/main/actionpack/lib/action_dispatch/journey/router/utils.rb
- OWASP ASVS 5.0.0: https://github.com/OWASP/ASVS/releases/tag/v5.0.0
- OWASP ASVS 5.0.0 V3.7.2: https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x12-V3-Web-Frontend-Security.md
- OWASP Redirect Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html
- WHATWG URL Standard: https://url.spec.whatwg.org/
- OAuth RFC 6749 Appendix A.5 (`state`): https://www.rfc-editor.org/rfc/rfc6749#appendix-A.5
- OAuth Security BCP RFC 9700: https://www.rfc-editor.org/rfc/rfc9700

ASVS V3.7.2は「自らが制御しないホストへの自動転送」のAllowlistを要求する。本件の**内部Origin内での危険なPath DenylistはUMAXICA独自の追加防御**であり、ASVSに同じ構造が直接義務づけられていると誤表現しない。

この文書は意思決定の**理由・目的・境界**を保持するための正本であり、実際のテスト結果と候補の識別は [今回の検証記録](../../evidence/2026-10-11-path-boundary-remediation.md) に保存する。過去の監査記録やADRの履歴を上書きしてはいけない。

## 11. 実装した境界と保守手順

実装は `normalize_url.ts` で明示的なHTTPS URLをauthority、直接pathname、query、fragmentに分ける。
これは構文の区分であり、origin認可には引き続きWHATWG URLの `origin` を使う。
各成分の符号化と制御文字を検査し、直接pathnameの構文検証は元パスとWHATWG解析後のパスに限定する。
query中のバックスラッシュや別URLのpathnameに直接パスの規則を適用しない。

`assertPathAllowed` は一度復号したpathnameに対し、format比較用の値から末尾のスラッシュを一つ取り除く。
この比較用の値は転送URLにも署名対象にも使用しない。
format suffixは拡張子の固定リストではなく、禁止基本パス直後のドットから同一セグメント末尾までを扱うため、`.HTML/`、`.arbitrary/`、`.tar.gz/` も拒否する。
複数スラッシュ、符号化された区切り、ドットセグメントは、その前の構文検証で拒否する。
基本パスは大文字と小文字を区別する既存契約を維持し、`/SIGN/out` を `/sign/out` と同一視しない。
受信側やproxyがcase foldingする構成は未検証であり、その構成を導入するときはポリシー変更と統合試験が必要となる。

`formatSuffix` はルールごとの明示指定である。
exactルールは無関係な `/sign/outbox` や `/sign/out/edit` に拡張しない。
subtreeルールは `/path/child` というセグメント境界で照合する。
12 Originの登録、13ノードのoriginグラフ、再署名前に全検証を済ませる順序は維持する。

Railsのルートを追加または変更するときは、担当者がHTTP method、GETの副作用、format、末尾区切り、middlewareの書換え、二次転送先を記録する。
その結果に基づいてorigin別のexact/subtreeとformatの指定を見直し、ポリシー単体と許可辺経由の署名付き否定試験を追加する。
通常パスとOAuthの肯定試験、実workerd、稼働予定RailsのURL比較とルーティングを実行してからリリース判断を更新する。
経路変更の理由はこの文書または該当ADRへ、実行結果は新しいevidenceへ保存する。

現在のRails Authには、正当なログアウト処理でBaseの `/sign/out` 宛RTを発行するコードがある。
この候補の拒否ポリシーは既にその遷移を拒否する設計であり、今回の別表現対策で互換性が解決するわけではない。
発行側と受信側の合意した遷移契約の検証をリリース条件に残す。
Rails JWKS問題の上申とP0対応依頼は [独立レポート](rails-jwks-refresh-escalation.md) に記載する。
