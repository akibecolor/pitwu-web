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

---

## はじめに

- 開発環境の構築 → [`docs/setup.md`](docs/setup.md)
- 本番・ステージングの構成図 → [`docs/environments.md`](docs/environments.md)

```bash
npm ci
cp .env.example .env   # MICROCMS_SERVICE_DOMAIN / MICROCMS_API_KEY を記入
npm run dev            # http://localhost:4321
```

---

## デプロイ

GitHub Actions（`.github/workflows/deploy.yml`）がビルドし、Cloudflare Pages に送る。

| ブランチ | 環境 | URL |
|---------|------|-----|
| `main` | 本番 | https://pitwu.com |
| `staging` | ステージング | https://staging.pitwu-web.pages.dev |

microCMS で記事を公開すると本番が自動で再ビルドされる。詳細は [`docs/environments.md`](docs/environments.md)。

---

## ドキュメント

| ファイル | 内容 |
|---------|------|
| [`docs/setup.md`](docs/setup.md) | **開発環境構築ガイド（新メンバーはここから）** |
| [`docs/environments.md`](docs/environments.md) | **本番・ステージングの構成図と設定** |
| [`docs/requirements.md`](docs/requirements.md) | 要件定義書 |
| [`docs/design.md`](docs/design.md) | アーキテクチャ・設計書 |
| [`docs/deploy.md`](docs/deploy.md) | Cloudflare Pages 初回構築の記録（移行時） |
| [`docs/discography.md`](docs/discography.md) | 作品ページの仕様・データ更新ルール |
| [`docs/operations.md`](docs/operations.md) | 日常運用ガイド（コンテンツ更新・注意事項） |
| [`docs/review.md`](docs/review.md) | コードレビュー結果 |
