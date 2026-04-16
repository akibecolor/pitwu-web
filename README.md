# pitwu-web

よさこいチーム「夢源風人」の公式サイト。  
Astro + microCMS + Cloudflare Pages で構築。

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フレームワーク | [Astro](https://astro.build) (SSG) |
| CMS（記事） | [microCMS](https://microcms.io) |
| ホスティング | [Cloudflare Pages](https://pages.cloudflare.com) |
| 検索 | [Pagefind](https://pagefind.app) |
| 認証（メンバーページ） | Cloudflare Zero Trust (Access) |

---

## ローカル開発

```bash
npm install
npm run dev      # http://localhost:4321
```

環境変数（`.env`）が必要：

```
MICROCMS_SERVICE_DOMAIN=xxxx
MICROCMS_API_KEY=xxxx
```

---

## デプロイ

`main` ブランチへ push すると Cloudflare Pages が自動ビルド・デプロイする。

```bash
git push origin main
```

ビルドログは Cloudflare ダッシュボードの **Workers & Pages → pitwu-web → Deployments** で確認。

---

## ドキュメント

| ファイル | 内容 |
|---------|------|
| [`docs/requirements.md`](docs/requirements.md) | 要件定義書 |
| [`docs/design.md`](docs/design.md) | アーキテクチャ・設計書 |
| [`docs/deploy.md`](docs/deploy.md) | Cloudflare Pages デプロイ手順 |
| [`docs/discography.md`](docs/discography.md) | 作品ページの仕様・データ更新ルール |
| [`docs/operations.md`](docs/operations.md) | 日常運用ガイド（コンテンツ更新・注意事項） |
| [`docs/review.md`](docs/review.md) | コードレビュー結果 |
