# レビュー結果

対象コミット: `7f9831b` リファクタリング差分
レビュー実施日: 2026-04-15

## 総評

リファクタリングの方向性は正しく、重複コード削除・責務分離ともに良好。ビルドも正常通過している（1117ページインデックス化）。指摘した Major 2件は最終コミット `1c0ff54` で解消済み。

---

## Critical（必ず修正が必要）

なし。

---

## Major（修正を強く推奨） — 全件解消済み

- [x] **`src/layouts/ArticleLayout.astro:36` `canonicalPath` の slug がデコードされていない** — 旧コードからの持ち越し問題

  - **問題**: `ArticleLayout.astro` は独自で `canonicalPath` を構築しており、`article.slug`（URLエンコード済み）をそのまま使用していた。`ArticleCard` 等は `getArticlePath()` 経由で decode されたパスを使うため、フッターのカノニカル URL と実際のページ URL が不一致になり得た。
  - **修正**: `getArticlePath(article)` を使うよう変更（コミット `1c0ff54`）。

- [x] **`scripts/upload-images-to-microcms.ts:46` `uploadImage` が `createMicroCmsClient.uploadMedia` に移行されていない**

  - **問題**: `scripts/lib/microcms.ts` に `uploadMedia` があるのに、`upload-images-to-microcms.ts` は独自 `uploadImage` を残していた。意図不明な状態。
  - **修正**: 「レートリミット時に文字列 'rate-limit' を返す必要がある + 進捗ログとエラーログを混ぜたい」という意図を明示するコメントを追加（コミット `1c0ff54`）。

---

## Minor（改善提案） — 後続で対応検討

- [ ] **`scripts/lib/microcms.ts:68-80` `fetchAll` / `getOne` に timeout 未設定**
  `patch` / `uploadMedia` には `AbortSignal.timeout` があるが GET 系にはない。2,000件取得中にネットワーク障害があると無限待機の可能性。
  **修正案**: GET にも `signal: AbortSignal.timeout(requestTimeoutMs)` を付与。

- [ ] **`scripts/lib/microcms.ts:157` `uploadMedia` の catch でエラー握り潰し**
  `} catch { return null; }` ですべての例外を黙殺。`console.warn(e)` 程度のログ出力を推奨。

- [ ] **`scripts/sync-wp-content.ts:26-31` `log` 関数がローカル定義のまま残る**
  ファイル出力も伴うため `tsLog` ではなくローカル定義としているが、`delay` は util から使用しており非対称。`appendFileSync` 含む log 関数を util に追加するか、ファイル固有のままにするか方針明確化を推奨。

- [ ] **`src/pages/[year]/[month]/[slug].astro:11` `getStaticPaths` で `getArticlePath()` 未使用**
  `getSourceDate()` を個別利用して year/month/slug を手計算しているが、`getArticlePath()` をパース・分解する形に統一する余地あり。現状で問題は無い。

- [ ] **`src/lib/htmlTransform.ts` 正規表現の `(?=<h3\b|$)`**
  歌詞ブロックが文書末尾にある場合のラップ動作は、リファクタ前後で挙動同一だが実データで再確認しておくと安心。

---

## 確認事項（質問・要確認） — 全件説明済み

1. **`upload-images-to-microcms.ts` の独自実装** — コメントで意図を明示済み（`1c0ff54`）。
2. **`ArticleLayout.astro` の slug デコード** — `getArticlePath()` 採用で解消（`1c0ff54`）。
3. **`wrapLyricsSection` の正規表現** — リファクタ前後で完全同一、設計書に「実データ検証済み」記載あり。

---

## 良かった点

- **設計書 (14節) を先行して作成してからコードを書く**進め方が徹底されており、実装と設計の乖離がほぼない。
- **`scripts/lib/` の3ファイル分離**（`env` / `util` / `microcms`）は責務が明確で、各スクリプトの先頭10行が一気に削減されている。`.env` パーサーの重複排除は効果が大きく、旧コードの `Object.fromEntries(... .split('='))` は `=` を含む値（private key 等）で誤動作するリスクがあり、`loadEnv` の正確な実装への置き換えは品質向上になっている。
- **`htmlTransform.ts` の正規表現**は旧コードとビット単位で一致しており、意図通り挙動変化なし。
- **`scanFiles` / `getMimeType` の共通化**で `upload-images-to-microcms.ts` と `test-single-article-upload.ts` のコードが一致するようになり、今後のバグ修正が一箇所で済む。
- ビルドが正常終了（1,117ページ生成）している。

---

## 承認条件

- [x] Major 2件 解消（`1c0ff54`）

**承認可。** Critical: 0件 / Major: 0件残（解消済み）/ Minor: 5件（後続検討）。
