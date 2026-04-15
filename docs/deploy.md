# デプロイ手順（Cloudflare Pages）

このドキュメントは pitwu-web を **Cloudflare Pages** に本番デプロイする手順を示します。

---

## 前提

- GitHub リポジトリ: `akibecolor/pitwu-web` （main ブランチ）
- Cloudflare アカウント取得済
- DNS 管理: 現状 pitwu.com の DNS 管理者であること
- microCMS 本番サービス稼働中（Hobbyプラン以上）

---

## Step 1. Cloudflare Pages プロジェクト作成

1. Cloudflare ダッシュボード → **Workers & Pages** → **Create application** → **Pages** タブ → **Connect to Git**
2. GitHub 連携 → リポジトリ `akibecolor/pitwu-web` を選択
3. **Build configuration**:

| 項目 | 値 |
|------|---|
| Framework preset | **Astro** |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | （空） |

4. **Environment variables**（Production / Preview 両方に追加）:

| 変数名 | 値 |
|--------|---|
| `MICROCMS_SERVICE_DOMAIN` | microCMS のサービスドメイン (例: `pitwu`) |
| `MICROCMS_API_KEY` | Content API キー（GET権限のみで可） |
| `NODE_VERSION` | `22` |

5. **Save and Deploy** をクリック

> ✅ ビルドが成功すると `xxxxx.pages.dev` の preview URL が発行されます。まずはそこで動作確認。

---

## Step 2. Preview デプロイで動作確認

| 確認項目 | 確認方法 |
|----------|----------|
| トップページ | `/` が hero CTA + 最新記事一覧 表示 |
| 記事詳細 | `/2026/04/magi-pitwu/` で本文・画像・動画再生・X 埋め込み |
| 作品ページ | `/discography/` 一覧 + `/discography/kaze/` 等個別 |
| 検索 | `/search/` で キーワード入力 → 候補表示（Pagefind） |
| RSS | `/rss.xml` が XML を返却 |
| カテゴリ・タグ | `/category/blog/` `/tag/.../` |
| リダイレクト | `/feed/` → `/rss.xml`、`/enbu-irarai/` → `/enbu-irai/` |
| sitemap | `/sitemap-index.xml` |
| robots | `/robots.txt` |

問題があれば修正 → push → 自動再デプロイ。

---

## Step 3. カスタムドメイン設定（DNS 切替）

> ⚠️ ここから本番影響あり。WordPress 旧サイトを残すなら必ずバックアップ取得後に。

1. Pages プロジェクトの **Custom domains** → **Set up a custom domain**
2. `pitwu.com`（apex）と `www.pitwu.com` を追加
3. Cloudflare が自動で DNS 設定を提示。pitwu.com の DNS が Cloudflare 管理下なら自動適用
   - **DNS が他社管理の場合**: 表示される `CNAME` レコードを既存DNS設定に手動で追加し、既存の WordPress 向け A レコードを削除
4. SSL 証明書発行を待つ（数分）
5. `https://pitwu.com/` でアクセス確認

---

## Step 4. WordPress 旧サイトの取扱

| シナリオ | 手順 |
|---------|------|
| **完全廃止** | DNS 切替後、旧サーバーは停止 or サブドメイン化 |
| **しばらく残す（推奨）** | サブドメイン `wp.pitwu.com` 等に移し、リダイレクトを強化 |
| **段階移行** | 旧サイトを残しつつ、Cloudflare Pages 側で 404/問題発生時のフォールバック確認 |

---

## Step 5. デプロイ後チェックリスト

- [ ] Google Search Console に新サイトを登録（旧URLからの 301 で評価維持）
- [ ] sitemap.xml を Search Console に送信
- [ ] OGP（X / Facebook）でURLシェアして画像が出るか確認（`/2026/04/magi-pitwu/` など）
- [ ] microCMS Webhook 設定（コンテンツ更新で Cloudflare Pages を自動再ビルド）
  - Cloudflare Pages → Settings → **Deploy hook** で生成した URL を microCMS の Webhook 設定に貼付
- [ ] アクセス解析（Cloudflare Web Analytics または GA4）有効化

---

## トラブルシューティング

| 症状 | 原因と対処 |
|------|-----------|
| ビルド失敗「Cannot find module 'microcms-js-sdk'」 | Node version が古い。`NODE_VERSION=22` を環境変数に追加 |
| 環境変数が反映されない | Production / Preview 両方に設定、保存後に再デプロイ |
| 画像が表示されない | microCMS CDN URL が直接配信されているため CF Pages のドメイン制約は無関係。F12 で URL 確認 |
| Pagefind 検索が空 | `npm run build` 後に dist/pagefind が生成されているか確認 |

---

## ロールバック

問題発生時は Pages の **Deployments** タブから 1 クリックで以前のデプロイに巻き戻し可能。DNS変更前なら `pages.dev` URL でテストデプロイし続けられる。
