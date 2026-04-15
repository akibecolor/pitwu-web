# 設計書 — pitwu.com リニューアル

**バージョン**: 0.3
**作成日**: 2026-04-14
**ステータス**: ユーザー確認中
**要件参照**: docs/requirements.md（承認済み 2026-04-14、v0.3 追記）

---

## 0. フェーズ計画

```
Phase 1 ── 基盤・移行（~Month 2）
  ├─ Astroプロジェクト初期化
  ├─ microCMS スキーマ設計・記事移行スクリプト実装
  ├─ 記事2,000件・コメント・固定ページの移行
  ├─ Pagefind 検索組み込み
  ├─ @astrojs/sitemap（ビルド時 XML サイトマップ生成）+ public/robots.txt
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
│  2. @astrojs/sitemap  →  dist に sitemap-index.xml 等を出力 │
│  3. pagefind --site dist  →  検索インデックス生成          │
│  4. dist/ を Cloudflare Edge にデプロイ                   │
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
│   ├── _redirects               # Cloudflare Pages リダイレクト設定
│   └── robots.txt               # Sitemap URL の宣言（検索エンジン向け）
├── astro.config.mjs             # site（本番絶対URL）+ @astrojs/sitemap
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
| `astro.config.mjs` | Astro設定（`site`・`@astrojs/sitemap` 統合） |
| `public/robots.txt` | `Sitemap:` で本番の sitemap-index.xml を指定 |
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

---

## 12. SEO・表記・メタ情報

### 用語（作品と演舞）

| 文脈 | 表記 | 例 |
|------|------|-----|
| ディスコグラフィ（`/discography/`）の一覧・各曲ページ・関連ナビ | **作品** | ページ見出し「作品」、`<title>` のセグメント `作品` |
| 依頼・出演・実績（会場での踊り） | **演舞** | 「演舞依頼」「訪問演舞」「演舞の様子」 |
| 英字サブタイトル（一覧ヘッダ） | **Works** | `PageLayout` の `pageSubtitle` |

※ URL パスは `discography` のままでよい（既存リンク・ブックマーク互換）。

※ **演舞依頼**の正規パスは `/enbu-irai/`（「依頼」のローマ字 `irai`）。誤記で使っていた `/enbu-irarai/` は `public/_redirects` から 301 リダイレクトする。

### `<title>` のパターン

| ページ種別 | パターン | 例 |
|------------|----------|-----|
| **トップ** | `夢源風人 \| よさこいチーム（大阪・東海）` | ブランド＋ジャンル＋地域のみ短く。キャッチは `description` へ |
| **一覧・ハブ** | `セクション名 \| 夢源風人` | `作品 \| 夢源風人`、`記事一覧 \| 夢源風人` |
| **作品詳細** | `曲名 \| 作品 \| 夢源風人` | 中間セグメントで種別を固定 |
| **活動記事** | `記事タイトル \| 活動記事 \| 夢源風人` | `ArticleLayout` で統一 |
| **申込・問い合わせ** | `目的 \| 夢源風人` | `演舞依頼 \| 夢源風人` |
| **メンバー配下** | `… \| メンバー \| 夢源風人` | 階層が分かるように |

下層ページではトップのような長い「よさこいチーム（大阪・東海）」を毎回繰り返さない。地域・補足は `description` で必要に応じて述べる。

### `meta description`

- 目安はおおよそ **120〜155 字**（日本語）。検索スニペット向けに一文〜二文。
- **トップ**: タグライン＋拠点＋サイトの内容。
- **一覧**: そのページで得られる情報（何の一覧か）。
- **作品詳細**: 作品名・年度＋歌詞・クレジット・動画などページ内の価値。
- **活動記事**: `ArticleLayout` で本文から HTML を除いた先頭を抜粋し、長さを制限。

### 実装の置き場所

| 項目 | 主なファイル |
|------|----------------|
| デフォルト `description` | `src/layouts/BaseLayout.astro` |
| 記事の `title` / `description` | `src/layouts/ArticleLayout.astro` |
| ページごとの上書き | 各 `src/pages/**/*.astro` の `BaseLayout` / `PageLayout` props |

### XML サイトマップ・`robots.txt`

| 項目 | 内容 |
|------|------|
| 統合 | `@astrojs/sitemap` を `astro.config.mjs` の `integrations` に指定 |
| 本番 URL | `defineConfig({ site: 'https://pitwu.com', ... })` — `www` の有無やプレビュー URL に合わせて変更する場合は `site` と `robots.txt` を揃える |
| ビルド出力 | `dist/sitemap-index.xml`、URL 件数に応じて `sitemap-0.xml` など |
| `robots.txt` | `public/robots.txt` をデプロイし、`Sitemap: https://pitwu.com/sitemap-index.xml` を記載 |
| 運用 | Google Search Console 等にサイトマップ URL を登録すると配信状況を確認しやすい |

---

## 13. グローバルナビ・フッター（実装）

全ページ共通。スタイルの詳細は `docs/design-concept.md` の UI 方針を参照。

### メインヘッダー（`src/components/Header.astro`）

| 項目 | 内容 |
|------|------|
| ロゴ | 横長ロゴ画像。クリックで `/` |
| トップのみ | 初回表示でヘッダー背景を透明にし、スクロールで群青系の背景を付与 |
| リンク（順） | **トップ** `/` → **作品** `/discography/` → **演舞依頼** `/enbu-irai/` → **スケジュール** `/schedule/` → **メンバー募集** `/recruit/` → **ブログ** `/articles/` → **お問合せ** `/contact/` → **検索** `/search/`（デスクトップはアイコン＋ sr-only ラベル） |
| モバイル | ハンバーガーでオーバーレイ。上記と同じリンク |

### フッター（`src/components/Footer.astro`）

| 領域 | 内容 |
|------|------|
| ブランド | 日本語チーム名・英字 **Mugenkajipitwu** |
| SNS | X / Instagram / YouTube / Facebook（外部リンク） |
| サイトマップ | 見出し「サイトマップ」の下に、ヘッダーと同順の主要ページへのリンク（トップ〜検索） |
| コピーライト | 年号付き All rights reserved |

---

## 14. 共通ユーティリティ・リファクタリング方針（2026-04-15 追記）

記事一覧カード・記事詳細・discography・移行スクリプト群で重複していた処理を共通化し、
再利用性と保守性を高める。純粋なリファクタリングのみで振る舞いは変えない。

### 14-1. `src/lib/articleHelpers.ts`（新規）

記事に関する日付・URL・アイキャッチ判定の共通ロジック。`ArticleCard.astro` と
`ArticleLayout.astro`、`[year]/[month]/[slug].astro` の重複を集約する。

| 関数/定数 | 用途 |
|-----------|------|
| `MIN_EYECATCH_SIZE` | アイキャッチ有効判定の最小辺長 (100px) |
| `hasUsableEyecatch(article)` | `eyecatch.width/height` が閾値以上かを返す |
| `getSourceDate(article)` | `wpDate ?? publishedAt` を返す |
| `getArticlePath(article)` | `/YYYY/MM/<decoded-slug>` を返す |
| `formatDateJa(iso)` | `YYYY年M月D日` フォーマット（`ja-JP` locale） |

### 14-2. `src/lib/htmlTransform.ts`（新規）

記事本文 HTML を表示用に後処理するピュア関数群。`ArticleLayout.astro` から抽出する。
WordPress 由来 HTML への正規表現ベース処理は既存実装を完全踏襲する（実データで検証済のため改変しない）。

| 関数 | 用途 |
|------|------|
| `expandTweetEmbeds(html)` | X/Twitter リンク段落を `blockquote.twitter-tweet` に変換 |
| `expandVideoEmbeds(html)` | `.mp4/.webm` リンク段落を `<video>` に変換 |
| `wrapLyricsSection(html)` | `<h3>歌詞</h3>` 以降を `.wp-lyrics` でラップ（discography 用） |
| `buildArticleMetaDescription(title, html)` | meta description 用の抜粋生成 |
| `hasTweetEmbed(html)` | widgets.js 読み込みが必要かを判定 |

### 14-3. `scripts/lib/env.ts`（新規）

移行スクリプト群（14ファイル以上）で重複していた `.env` パーサーを集約する。

| export | 説明 |
|--------|------|
| `loadEnv(): Record<string, string>` | `.env` をパースして返す（# コメント・クォート対応） |
| `requireMicroCmsEnv(): { domain, apiKey }` | microCMS 用環境変数必須チェック付き取得 |

### 14-4. `scripts/lib/microcms.ts`（新規）

microCMS API 呼び出しの共通ヘルパー。

| export | 説明 |
|--------|------|
| `createMicroCmsClient({ domain, apiKey })` | `{ fetchAll, getOne, patch, create, uploadMedia }` を返すファクトリ |
| `getMimeType(filename)` | ファイル名から Content-Type を推定 |

※ `microcms-js-sdk` は `src/lib/microcms.ts` で利用。スクリプト側は従来通り fetch ベース（管理API と公開API 両方を柔軟に扱うため）。

### 14-5. `scripts/lib/util.ts`（新規）

| export | 説明 |
|--------|------|
| `delay(ms)` | `setTimeout` Promise ラッパー |
| `tsLog(msg)` | `[ISO-timestamp] msg` 形式で `console.log` |
| `scanFiles(dir)` | 再帰的にファイル一覧を取得 |

### 14-6. 変更対象スクリプト

`.env` パース・`delay`・`tsLog`・`fetchAllArticles` の重複を上記共通化に差し替える。
動作は完全に同一とする。対象:

- `scripts/upload-to-microcms.ts`
- `scripts/upload-images-to-microcms.ts`
- `scripts/sync-wp-content.ts`
- `scripts/resync-articles-with-cdn.ts`
- `scripts/reupload-failed.ts`
- `scripts/patch-dates.ts`
- `scripts/fix-small-eyecatch.ts`
- `scripts/handle-external-images.ts`
- `scripts/scan-missing-tweets.ts`
- `scripts/beautify-article-links.ts`
- `scripts/create-magi-article.ts`
- `scripts/download-wp-images.ts`
- `scripts/test-single-article-upload.ts`

`gcal.ts` / `test-gcal.ts` は microCMS と無関係（`.env` パースのみ共通化対象）。
`analyze-images.ts` / `cleanup-images.ts` は `.env` を使わないのでそのまま。

### 14-7. 考慮したトレードオフ

| 判断 | 理由 |
|------|------|
| `src/lib/microcms.ts`（SDKベース）と `scripts/lib/microcms.ts`（fetch ベース）を分ける | SDK は read-only / Content API 専用。スクリプトは Management API（`microcms-management.io`）・PATCH・media upload が必要で、SDK だけでは賄えない。両者を無理に統合すると抽象化が崩れる |
| 正規表現ベースの HTML 変換を維持 | 実データ（約2,000記事）で検証済み。DOM パーサ導入はリスクが大きく今回のスコープ外 |
| discography の巨大 CSS はそのまま残す | 分割するには CSS アーキテクチャ全体の設計議論が必要。純粋リファクタの範囲外 |
| スクリプトの型定義共通化は最小限 | 各スクリプトのスコープが異なるため、ローカル型定義を保つほうが読みやすい |

