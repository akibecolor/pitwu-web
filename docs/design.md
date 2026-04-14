# 設計書 — pitwu.com リニューアル

**バージョン**: 0.2
**作成日**: 2026-04-14
**ステータス**: ユーザー確認中
**要件参照**: docs/requirements.md（承認済み 2026-04-14）

---

## 0. フェーズ計画

```
Phase 1 ── 基盤・移行（~Month 2）
  ├─ Astroプロジェクト初期化
  ├─ microCMS スキーマ設計・記事移行スクリプト実装
  ├─ 記事2,000件・コメント・固定ページの移行
  ├─ Pagefind 検索組み込み
  ├─ Cloudflare Pages デプロイ（pitwu-web.pages.dev で動作確認）
  └─ Cloudflare Zero Trust 設定（/members/*）

Phase 2 ── デザインレビュー・実装（~Month 2.5）
  ├─ デザイン案の作成・提示
  ├─ ユーザーレビュー・フィードバック
  ├─ 承認後にデザイン実装
  └─ pitwu-web.pages.dev で最終確認

Phase 3 ── ドメイン切り替え（ユーザーが任意のタイミングで実施）
  ├─ Cloudflare Pages にカスタムドメイン設定
  ├─ DNS を Cloudflare へ変更
  └─ さくらサーバー停止
```

> **さくらサーバーの WordPress は Phase 3 完了まで停止しない。**

---

## 1. アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────┐
│                    GitHub (pitwu-web)                   │
│  コード + 固定ページ + 移行スクリプト                       │
└────────────────────┬────────────────────────────────────┘
                     │ git push → 自動ビルド
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Cloudflare Pages (CI/CD)                   │
│  1. npm run build  →  Astro が microCMS API から記事取得  │
│  2. pagefind --site dist  →  検索インデックス生成          │
│  3. dist/ を Cloudflare Edge にデプロイ                   │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
┌─────────────────┐   ┌──────────────────────┐
│ Cloudflare      │   │  静的ファイル配信      │
│ Zero Trust      │   │  (HTML/CSS/JS/画像)   │
│ (認証ゲート)     │   │                      │
│ 特定パスを保護   │   │  Pagefind インデックス │
└─────────────────┘   └──────────────────────┘

ビルド時のみ参照:
┌─────────────────────────────────────────────────────────┐
│                    microCMS                             │
│  記事 (~2,000件) / カテゴリ / タグ                        │
│  Content API → Astro がビルド時に全記事取得               │
└─────────────────────────────────────────────────────────┘
```

---

## 2. ディレクトリ構成

```
pitwu-web/
├── .claude/
│   └── agents/                  # カスタムエージェント定義
├── docs/                        # 設計・要件ドキュメント
├── scripts/                     # 移行スクリプト（Node.js/TypeScript）
│   ├── wp-to-json.ts            # WordPress XML → JSON変換
│   ├── upload-to-microcms.ts    # JSON → microCMS 一括登録
│   ├── upload-images.ts         # 画像を microCMS にアップロード
│   └── generate-redirects.ts    # _redirects ファイル生成
├── src/
│   ├── components/
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── ArticleCard.astro    # 記事一覧カード
│   │   ├── CommentList.astro    # コメント静的表示
│   │   └── Search.astro         # Pagefind 検索UI
│   ├── layouts/
│   │   ├── BaseLayout.astro     # 共通レイアウト
│   │   └── ArticleLayout.astro  # 記事ページレイアウト
│   ├── pages/
│   │   ├── index.astro          # トップページ
│   │   ├── articles/
│   │   │   ├── index.astro      # 記事一覧
│   │   │   └── [slug].astro     # 記事詳細（動的ルート）
│   │   ├── search.astro         # 検索ページ
│   │   └── (固定ページ 約20枚)  # .astro または .md
│   ├── lib/
│   │   └── microcms.ts          # microCMS APIクライアント
│   ├── data/
│   │   └── comments.json        # WordPressコメントデータ（静的）
│   └── types/
│       └── index.ts             # 型定義
├── public/
│   └── _redirects               # Cloudflare Pages リダイレクト設定
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

---

## 3. microCMS コンテンツスキーマ

### 3-1. 記事（articles）

| フィールドID | 表示名 | 種類 | 備考 |
|-------------|--------|------|------|
| `title` | タイトル | テキスト | 必須 |
| `slug` | スラッグ | テキスト | URLに使用、WordPress時代のものを引き継ぐ |
| `content` | 本文 | リッチエディタ | HTML形式 |
| `publishedAt` | 公開日 | 日時 | WordPress投稿日を引き継ぐ |
| `eyecatch` | アイキャッチ画像 | 画像 | |
| `category` | カテゴリ | コンテンツ参照（categories） | |
| `tags` | タグ | 複数コンテンツ参照（tags） | |
| `wpPostId` | WordPress記事ID | 数値 | 移行時の照合・リダイレクト生成用 |

### 3-2. カテゴリ（categories）

| フィールドID | 種類 |
|-------------|------|
| `name` | テキスト |
| `slug` | テキスト |

### 3-3. タグ（tags）

| フィールドID | 種類 |
|-------------|------|
| `name` | テキスト |
| `slug` | テキスト |

---

## 4. コメントデータの扱い

WordPressのコメントは**ビルド時に静的JSONとして組み込む**。

```
src/data/comments.json
{
  "記事slug": [
    {
      "author": "名前",
      "date": "2023-01-01",
      "content": "コメント本文"
    }
  ]
}
```

- 移行スクリプトで WordPress XML から抽出し生成する
- 新規コメント投稿機能は実装しない（REQ-03）

---

## 5. Pagefind 組み込み

```json
// package.json scripts
{
  "build": "astro build",
  "postbuild": "pagefind --site dist",
  "dev": "astro dev"
}
```

- `astro build` 完了後に `pagefind` が `dist/` をインデックス化
- Cloudflare Pages のビルドコマンドは `npm run build`（postbuild が自動実行される）
- 検索UIは `Search.astro` コンポーネントに Pagefind の Web Components を組み込む

---

## 6. microCMS APIクライアント（`src/lib/microcms.ts`）

```typescript
import { createClient } from 'microcms-js-sdk';

export const client = createClient({
  serviceDomain: import.meta.env.MICROCMS_SERVICE_DOMAIN,
  apiKey: import.meta.env.MICROCMS_API_KEY,
});

export type Article = {
  id: string;
  title: string;
  slug: string;
  content: string;
  publishedAt: string;
  eyecatch?: { url: string };
  category?: { name: string; slug: string };
  tags?: { name: string; slug: string }[];
};

export async function getAllArticles(): Promise<Article[]> {
  // 2,000件を超えるためoffset/limitでページネーションして全件取得
  const limit = 100;
  let offset = 0;
  const all: Article[] = [];
  while (true) {
    const res = await client.getList<Article>({
      endpoint: 'articles',
      queries: { limit, offset, fields: 'id,title,slug,publishedAt,eyecatch,category,tags' },
    });
    all.push(...res.contents);
    if (all.length >= res.totalCount) break;
    offset += limit;
  }
  return all;
}

export async function getArticleBySlug(slug: string): Promise<Article> {
  const res = await client.getList<Article>({
    endpoint: 'articles',
    queries: { filters: `slug[equals]${slug}`, limit: 1 },
  });
  return res.contents[0];
}
```

---

## 7. URL構造と動的ルート

### WordPress の既存URL構造

```
https://pitwu.com/YYYY/MM/<title>
例: https://pitwu.com/2023/06/my-article
```

### 新サイトでの方針：**URL構造を完全に引き継ぐ**

SEO評価をリダイレクトなしで最大限に引き継ぐため、Astro側で同じパス構造を再現する。

```
src/pages/[year]/[month]/[slug].astro
→ /2023/06/my-article のような URL を静的生成
```

### `src/pages/[year]/[month]/[slug].astro`

```typescript
export async function getStaticPaths() {
  const articles = await getAllArticles();
  return articles.map(article => {
    const date = new Date(article.publishedAt);
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return {
      params: { year, month, slug: article.slug },
      props: { article },
    };
  });
}
```

2,000件すべてをビルド時に静的生成する。

> **メリット**: `_redirects` の大量記述が不要になり、URLの完全一致でSEO評価を引き継げる。  
> **注意点**: microCMS の `slug` フィールドにWordPress時代の `<title>` 部分をそのまま格納する必要がある。

---

## 8. 移行スクリプト設計

### 実行順序

```
1. scripts/wp-to-json.ts
   WordPress XML → src/data/wp-articles.json
                 → src/data/comments.json

2. scripts/upload-images.ts
   WordPress の画像URL → microCMS メディアAPI へアップロード
   → URL マッピング表（image-map.json）を生成

3. scripts/upload-to-microcms.ts
   wp-articles.json + image-map.json
   → 本文内の画像URLを置換（MIG-04）
   → microCMS マネジメントAPI で記事を一括登録

4. scripts/generate-redirects.ts
   wp-articles.json の旧URL → 新スラッグ を元に
   → public/_redirects を生成（MIG-05）
```

### 環境変数（`.env`）

```
MICROCMS_SERVICE_DOMAIN=xxxx
MICROCMS_API_KEY=xxxx
MICROCMS_MANAGEMENT_API_KEY=xxxx   # 移行スクリプト専用（書き込み権限）
```

---

## 9. Cloudflare Pages 設定

| 項目 | 値 |
|------|-----|
| ビルドコマンド | `npm run build` |
| 出力ディレクトリ | `dist` |
| Node.js バージョン | 20.x |
| 環境変数 | `MICROCMS_SERVICE_DOMAIN`, `MICROCMS_API_KEY` |

### Zero Trust (Access) の設定

| パス | 認証 | 対象 |
|------|------|------|
| `/*` | 不要 | 一般記事・固定ページ（誰でも閲覧可） |
| `/members/*` | 必要 | メンバーページ（許可メール/ドメインのみ） |

- Cloudflareダッシュボードで `/members/*` にアクセスポリシーを設定する（コード不要）
- `src/pages/members/` 以下にメンバー向けページを配置する

---

## 10. 変更対象ファイル一覧

| ファイル | 内容 |
|---------|------|
| `astro.config.mjs` | Astro設定（output: static） |
| `package.json` | 依存パッケージ + ビルドスクリプト |
| `src/lib/microcms.ts` | APIクライアント |
| `src/types/index.ts` | 型定義 |
| `src/data/comments.json` | コメント静的データ（移行後生成） |
| `src/layouts/BaseLayout.astro` | 共通レイアウト |
| `src/layouts/ArticleLayout.astro` | 記事レイアウト |
| `src/pages/index.astro` | トップページ |
| `src/pages/articles/index.astro` | 記事一覧 |
| `src/pages/[year]/[month]/[slug].astro` | 記事詳細（URL構造を既存と一致） |
| `src/pages/members/index.astro` | メンバーページ（Cloudflare Accessで保護） |
| `src/pages/search.astro` | 検索ページ |
| `src/components/Search.astro` | Pagefind UI |
| `src/components/CommentList.astro` | コメント表示 |
| `public/_redirects` | リダイレクト設定（差分のみ） |
| `scripts/wp-to-json.ts` | 移行スクリプト① |
| `scripts/upload-images.ts` | 移行スクリプト② |
| `scripts/upload-to-microcms.ts` | 移行スクリプト③ |
| `scripts/generate-redirects.ts` | 移行スクリプト④（URL変更があった記事のみ） |

---

## 11. 考慮事項・トレードオフ

| 判断 | 採用理由 |
|------|---------|
| ビルド時全件静的生成（SSG） | 2,000件はAstroのSSGで現実的な範囲。CDNキャッシュで最速配信 |
| microCMSの全件取得はビルド時のみ | ランタイムにAPIを叩かないため、本番でAPIキーが不要・コスト不要 |
| コメントをJSONで静的管理 | 新規投稿不要のため外部サービス（Disqus等）を使わず表示速度を維持 |
| 固定ページをGit管理 | 更新頻度が低くCMS管理の恩恵が薄い。LLMとの相性も良い |
| 移行スクリプトをTypeScriptで実装 | 型安全性と補完によりLLM補助開発がしやすい |
