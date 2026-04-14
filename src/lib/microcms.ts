import { createClient } from 'microcms-js-sdk';
import type { Article, Category, Tag } from '../types/index.js';

const client = createClient({
  serviceDomain: import.meta.env.MICROCMS_SERVICE_DOMAIN,
  apiKey: import.meta.env.MICROCMS_API_KEY,
});

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
  return fetchAll<Article>('articles', {
    fields: 'id,title,slug,publishedAt,eyecatch,category,tags,wpPostId',
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
