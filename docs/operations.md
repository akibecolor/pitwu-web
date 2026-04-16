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

---

## よくある問題

| 症状 | 確認箇所 |
|------|---------|
| push しても反映されない | Cloudflare Pages のビルドログを確認（失敗していないか） |
| 画像が表示されない | `public/images/` のパスが正しいか確認 |
| 作品ページが壊れて表示される | `wp-pages.json` の JSON 構文エラー。`npm run build` でエラー内容を確認 |
| 検索が動かない | Pagefind インデックスがビルドされているか確認（`dist/pagefind/` が存在するか） |
