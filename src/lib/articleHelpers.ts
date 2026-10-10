/**
 * 記事に関する共通ヘルパー。
 * ArticleCard / ArticleLayout / 動的ルート間で重複していたロジックを集約する。
 */
import type { Article } from '../types/index.js';

/** アイキャッチ画像として扱う最小辺長（px）。これ未満は絵文字等とみなし使わない。 */
export const MIN_EYECATCH_SIZE = 100;

/**
 * eyecatch が存在し、かつ幅・高さが最小サイズ以上なら true。
 * 昔の記事の小さな絵文字画像などをアイキャッチから除外する用途。
 */
export function hasUsableEyecatch(article: Article): boolean {
  return Boolean(
    article.eyecatch &&
      article.eyecatch.width >= MIN_EYECATCH_SIZE &&
      article.eyecatch.height >= MIN_EYECATCH_SIZE
  );
}

/**
 * 表示用の日付ソース。wpDate（WordPress 投稿日）があればそちらを優先し、
 * なければ publishedAt（microCMS 新規作成記事）を返す。
 */
export function getSourceDate(article: Article): string {
  return article.wpDate || article.publishedAt;
}

/**
 * URL に使う slug（デコード済み）を返す。
 * slug は WordPress 由来で URL エンコード済みの場合があるためデコードする。
 * slug は任意入力。未入力の記事は microCMS の記事 ID を使う（ID は変わらないので URL も変わらない）。
 * 以前は decodeURIComponent(undefined) が "undefined" を返し、/YYYY/MM/undefined/ になっていた。
 */
export function getArticleSlug(article: Article): string {
  return article.slug ? decodeURIComponent(article.slug) : article.id;
}

/** 記事の正規パス（`/YYYY/MM/<decoded-slug>`）を返す。 */
export function getArticlePath(article: Article): string {
  const date = new Date(getSourceDate(article));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `/${year}/${month}/${getArticleSlug(article)}`;
}

/**
 * ISO 文字列を日本語ロケールの `YYYY年M月D日` 形式にフォーマット。
 */
export function formatDateJa(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
