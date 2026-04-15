import { createClient } from 'microcms-js-sdk';
import type { Article, Category, Tag } from '../types/index.js';

// 環境変数の取得: import.meta.env (Vite/Astro) が空なら process.env (Cloudflare Pages 等)
// ビルド環境によって優先順位が異なるため両方フォールバック
const serviceDomain = import.meta.env.MICROCMS_SERVICE_DOMAIN || process.env.MICROCMS_SERVICE_DOMAIN;
const apiKey       = import.meta.env.MICROCMS_API_KEY        || process.env.MICROCMS_API_KEY;

if (!serviceDomain || !apiKey) {
  throw new Error(
    `microCMS env vars が未設定: MICROCMS_SERVICE_DOMAIN=${serviceDomain ? 'set' : 'EMPTY'}, MICROCMS_API_KEY=${apiKey ? 'set' : 'EMPTY'}`
  );
}

const client = createClient({ serviceDomain, apiKey });

const LIMIT = 100;

async function fetchAll<T>(endpoint: string, queries: Record<string, unknown> = {}): Promise<T[]> {
  let offset = 0;
  const all: T[] = [];
  while (true) {
    const res = await client.getList<T>({
      endpoint,
      queries: { ...queries, limit: LIMIT, offset },
    });
    all.push(...res.contents);
    if (all.length >= res.totalCount) break;
    offset += LIMIT;
  }
  return all;
}

export async function getAllArticles(): Promise<Article[]> {
  const articles = await fetchAll<Article>('articles', {
    fields: 'id,title,slug,publishedAt,wpDate,eyecatch,category,tags,wpPostId',
  });
  // WordPress の投稿日時で降順ソート（wpDate がない場合は publishedAt にフォールバック）
  return articles.sort((a, b) => {
    const dateA = a.wpDate ?? a.publishedAt;
    const dateB = b.wpDate ?? b.publishedAt;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });
}

export async function getArticleBySlug(slug: string): Promise<Article | undefined> {
  const res = await client.getList<Article>({
    endpoint: 'articles',
    queries: { filters: `slug[equals]${slug}`, limit: 1 },
  });
  return res.contents[0];
}

export async function getAllCategories(): Promise<Category[]> {
  return fetchAll<Category>('categories');
}

export async function getAllTags(): Promise<Tag[]> {
  return fetchAll<Tag>('tags');
}
