# 運用ガイド — pitwu.com

日常的なコンテンツ更新・サイト運用の手引き。

---

## デプロイの流れ

コードや静的データを変更したら `main` ブランチに push するだけで自動デプロイされる。

```bash
git add <変更ファイル>
git commit -m "変更内容"
git push origin main
```

- **ビルド時間**: 約15〜20分（microCMS から記事を全件取得するため）
- **ロールバック**: Cloudflare ダッシュボード → Pages → Deployments → 過去デプロイを「Rollback」

---

## コンテンツ別の更新方法

### ブログ記事

microCMS の管理画面から追加・編集。  
保存 → Webhook → Cloudflare Pages が自動で再ビルド（デプロイフックが設定済みの場合）。

> デプロイフックの設定: Cloudflare Pages → Settings → Deploy hooks で URL 発行 → microCMS の Webhook に登録。

---

### 作品ページ（ディスコグラフィ）

**ファイル**: `src/data/wp-pages.json`

詳細な更新ルールは [`docs/discography.md`](discography.md) を参照。  
JSON を編集して push すれば反映される。

---

### スケジュール（`/schedule/`）

Google Calendar で管理。CLI から操作できる：

```bash
npx tsx scripts/gcal.ts
```

または Claude Code の `gcal-agent` を使って自然言語で操作可能。

---

### メンバー募集ページ（`/recruit/`）

**ファイル**: `src/pages/recruit.astro`

- 募集文言・料金は `.astro` ファイルを直接編集
- メンバー規約 PDF は `public/docs/kiyaku_X_X.pdf` に配置し、`recruit.astro` 内のリンクを更新

```astro
<!-- recruit.astro 内 -->
<a href="/docs/kiyaku_2_8.pdf" ...>メンバー規約（PDF）</a>
```

**PDF 更新手順:**
1. 新しい PDF を `public/docs/` に置く（ファイル名に版番号を入れる: 例 `kiyaku_2_9.pdf`）
2. `recruit.astro` の `href` を新しいファイル名に変更
3. 古い PDF は削除する
4. push

---

### 演舞依頼ページ（`/enbu-irai/`）

**ファイル**: `src/pages/enbu-irai.astro`  
直接 `.astro` ファイルを編集する。

---

### フッター・ヘッダー

**ファイル**: `src/components/Footer.astro` / `src/components/Header.astro`

- フッターの著作権年は `new Date().getFullYear()` で自動更新（手動変更不要）
- ナビリンクの追加・変更はこれらのファイルを編集

---

### リダイレクト

**ファイル**: `public/_redirects`

Cloudflare Pages のリダイレクト設定。  
形式: `旧パス 新パス ステータスコード`

```
/old-path/ /new-path/ 301
```

---

## 固定ページ一覧

Git で管理されている固定ページ（`src/pages/`）：

| ページ | ファイル |
|--------|---------|
| トップ | `src/pages/index.astro` |
| 作品一覧 | `src/pages/discography/index.astro` |
| 作品詳細 | `src/pages/discography/[slug].astro` |
| 演舞依頼 | `src/pages/enbu-irai.astro` |
| スケジュール | `src/pages/schedule.astro` |
| メンバー募集 | `src/pages/recruit.astro` |
| お問合せ | `src/pages/contact.astro` |
| 検索 | `src/pages/search.astro` |
| メンバーページ | `src/pages/members/` |

---

## 静的ファイルの配置

`public/` 以下に置いたファイルはそのまま配信される。

| ディレクトリ | 内容 |
|------------|------|
| `public/docs/` | PDF ファイル（規約等） |
| `public/images/` | 作品・活動の画像（WordPress 移行分） |
| `public/_redirects` | Cloudflare Pages リダイレクト |
| `public/robots.txt` | クローラー向け設定 |

---

## 注意事項

### やってはいけないこと

- **`public/_redirects` から既存リダイレクトを削除しない**  
  外部サイトからのリンクや古いブックマークが壊れる。追記のみ行うこと。

- **`src/data/wp-pages.json` の `content` フィールドを消さない**  
  レガシーコンテンツの保険として残してある（表示には使われていないが削除不可）。

- **`public/images/` 以下の画像パスを変更しない**  
  WordPress 移行コンテンツ内の `<img src="...">` がこのパスを参照している。

- **`src/pages/members/` を誰でも見られる場所に移動しない**  
  Cloudflare Zero Trust で保護されているパス。

### 気をつけること

- **JSON の編集ミスに注意**  
  `wp-pages.json` は大きいファイル。編集後にビルド（`npm run build`）でエラーが出ないか確認してから push するのが安全。

- **PDFのファイルサイズ**  
  `public/` に置く PDF は圧縮済みのものを使う（大きすぎるとビルドが遅くなる）。

- **microCMS の API キーをコードに書かない**  
  `.env` に記述し、`.gitignore` で除外されていることを確認。

---

## 環境変数

| 変数名 | 用途 | 設定場所 |
|--------|------|---------|
| `MICROCMS_SERVICE_DOMAIN` | microCMS サービスドメイン | `.env` + Cloudflare Pages 環境変数 |
| `MICROCMS_API_KEY` | microCMS Content API キー | `.env` + Cloudflare Pages 環境変数 |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google Calendar 操作用 | `.env`（ローカルのみ） |
| `GOOGLE_PRIVATE_KEY` | Google Calendar 操作用 | `.env`（ローカルのみ） |
| `CONTACT_ENDPOINT` | 問い合わせ受け口（Apps Script の `/exec` URL） | Cloudflare Pages 環境変数 |
| `CONTACT_SHARED_SECRET` | 問い合わせ受け口の共有シークレット | Cloudflare Pages 環境変数 |

---

## 問い合わせフォーム（`/contact/`）

### 仕組み

```
ブラウザ → /api/contact（Cloudflare Pages Function）→ Apps Script ウェブアプリ
                                                        ├─ スプレッドシートへ記録
                                                        ├─ 問い合わせ者へ受付確認メール
                                                        └─ 事務局へ通知メール
```

- ページ: `src/pages/contact.astro`
- 中継: `functions/api/contact.ts`
- 受け口: `scripts/apps-script/contact.gs`

送信完了画面には**送信内容の控え**（コピーボタン付き・スクリーンショット可）を表示する。
メールを見ない利用者が多いため。受付日時は Apps Script が返す `receivedAt` を使うので
スプレッドシートの「受信日時」と完全に一致する（返ってこない場合はブラウザ側で日本時間を補完）。

> **なぜ Google フォーム直送信をやめたか**
> Google フォームが送信時に invisible reCAPTCHA を必須化したため、ブラウザからの
> 直接 POST は常に HTTP 400 で破棄されるようになった。さらに旧実装は `mode:'no-cors'`
> で失敗を検知できず、**届いていないのに「受け付けました」と表示していた**。

### セットアップ手順（初回のみ）

1. **記録先スプレッドシートを用意**
   新規スプレッドシートを作成し、URL の `/d/` と `/edit` の間の文字列（=ID）を控える。
   シートは自動作成されるので、タブを手で作る必要はない。

2. **Apps Script プロジェクトを作成**
   [script.google.com](https://script.google.com/) →「新しいプロジェクト」→
   `scripts/apps-script/contact.gs` の内容を貼り付けて保存。

3. **スクリプト プロパティを設定**（プロジェクトの設定 → スクリプト プロパティ）

   | キー | 値 |
   |------|-----|
   | `SHARED_SECRET` | 推測されない長い文字列（後述の `CONTACT_SHARED_SECRET` と同じ値） |
   | `SPREADSHEET_ID` | 手順1で控えた ID |
   | `NOTIFY_TO` | 事務局の通知先（任意／既定 `contact@pitwu.com`） |
   | `SHEET_NAME` | 記録先シート名（任意／既定「サイト問い合わせ」） |

4. **ウェブアプリとしてデプロイ**
   「デプロイ」→「新しいデプロイ」→ 種類は **ウェブアプリ**
   - 次のユーザーとして実行: **自分**
   - アクセスできるユーザー: **全員**
   発行された `https://script.google.com/macros/s/.../exec` の URL を控える。
   初回は Google の承認画面が出るので許可する（メール送信とシート書き込みの権限）。

5. **Cloudflare Pages に環境変数を設定**
   Pages → Settings → Environment variables に以下を追加し、再デプロイ。

   | 変数名 | 値 |
   |--------|-----|
   | `CONTACT_ENDPOINT` | 手順4の `/exec` URL |
   | `CONTACT_SHARED_SECRET` | 手順3の `SHARED_SECRET` と同じ値 |

### 動作確認

```bash
# 設定済みかどうかだけ確認（秘密は出ない）
curl -s https://pitwu.com/api/contact
# => {"ok":true,"configured":true}
```

そのうえで `/contact/` から実際に1件送信し、**①完了画面が出る ②スプレッドシートに行が増える
③受付確認メールが届く ④事務局に通知が届く** の4点を確認する。

> `configured:false` の場合、フォームは送信時にエラーと代替手段（LINE／Googleフォーム）を表示する。
> **成功したふりはしない**設計なので、取りこぼしは起きない。

### つまずいたときは

| 症状 | 原因と対処 |
|------|-----------|
| `送信先の応答が不正です` と表示される | Apps Script が HTML を返している。`/exec` を**ブラウザで直接開く**と原因が読める。`スクリプト関数が見つかりません: doPost` なら、コードが未反映（下記参照） |
| `スクリプト関数が見つかりません: doPost` | **最頻出。** `/exec` は「デプロイした時点のコードのスナップショット」を実行する。コードを貼って保存しても既存デプロイは古いまま。デプロイ →「デプロイを管理」→ 鉛筆アイコンで編集 → バージョンを**「新バージョン」**にして再デプロイする |
| `unauthorized` | Cloudflare の `CONTACT_SHARED_SECRET` と Apps Script の `SHARED_SECRET` が不一致 |
| `SPREADSHEET_ID not configured` | スクリプト プロパティの設定漏れ |
| 環境変数を入れたのに `configured:false` | **Pages の環境変数は既存のデプロイには反映されない。** 追加後に再デプロイが必要（`gh workflow run deploy.yml --ref main`）。反映直後は数分ほど true/false が混在する（エッジ伝播） |

### 注意

- Apps Script のメール送信は無料枠で **1日100通** まで（1件の問い合わせで2通消費）。
- コードを直した後は Apps Script 側で**「新しいデプロイ」を作り直す**（保存だけでは反映されない）。
- 旧 Google フォーム自体は残してあり、エラー時の代替リンク先として使っている。
- `functions/api/contact.ts` は上流失敗時に **502 を返さない**。Cloudflare のエッジが 502 を
  自前のエラーページに差し替えてしまい、原因の JSON がページに届かなくなるため（`200 + ok:false` で返す）。

---

## よくある問題

| 症状 | 確認箇所 |
|------|---------|
| push しても反映されない | Cloudflare Pages のビルドログを確認（失敗していないか） |
| 画像が表示されない | `public/images/` のパスが正しいか確認 |
| 作品ページが壊れて表示される | `wp-pages.json` の JSON 構文エラー。`npm run build` でエラー内容を確認 |
| 検索が動かない | Pagefind インデックスがビルドされているか確認（`dist/pagefind/` が存在するか） |
