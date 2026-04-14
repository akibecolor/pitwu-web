/**
 * WordPress REST API から記事・カテゴリ・タグ・コメントを取得して
 * scripts/data/ にJSONとして保存する
 *
 * 実行: npx tsx scripts/fetch-wp.ts
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const WP_BASE = 'https://pitwu.com/wp-json/wp/v2';
const DATA_DIR = join(process.cwd(), 'scripts/data');

mkdirSync(DATA_DIR, { recursive: true });

async function fetchAll<T>(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;

  while (true) {
    const url = new URL(`${WP_BASE}/${endpoint}`);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    console.log(`  GET ${endpoint} page ${page}...`);
    const res = await fetch(url.toString());

    if (!res.ok) {
      console.error(`  エラー: ${res.status} ${res.statusText}`);
      break;
    }

    const data = (await res.json()) as T[];
    if (!Array.isArray(data) || data.length === 0) break;

    all.push(...data);

    const totalPages = Number(res.headers.get('X-WP-TotalPages') ?? 1);
    console.log(`  → ${all.length} / ${res.headers.get('X-WP-Total')} 件取得`);
    if (page >= totalPages) break;
    page++;
  }

  return all;
}

function save(filename: string, data: unknown) {
  const path = join(DATA_DIR, filename);
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`✔ 保存: ${path}`);
}

// ---- 記事 ----
console.log('\n▶ 記事を取得中...');
const posts = await fetchAll<WpPost>('posts', {
  _fields: 'id,date,slug,title,content,excerpt,featured_media,categories,tags',
  _embed: 'wp:featuredmedia',
});
save('wp-posts.json', posts);

// ---- カテゴリ ----
console.log('\n▶ カテゴリを取得中...');
const categories = await fetchAll<WpTerm>('categories', {
  _fields: 'id,name,slug',
});
save('wp-categories.json', categories);

// ---- タグ ----
console.log('\n▶ タグを取得中...');
const tags = await fetchAll<WpTerm>('tags', {
  _fields: 'id,name,slug',
});
save('wp-tags.json', tags);

// ---- コメント ----
console.log('\n▶ コメントを取得中...');
const comments = await fetchAll<WpComment>('comments', {
  _fields: 'id,post,author_name,date,content',
  status: 'approved',
});
save('wp-comments.json', comments);

console.log('\n✅ 完了');

// ---- 型定義 ----
type WpPost = {
  id: number;
  date: string;
  slug: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  featured_media: number;
  categories: number[];
  tags: number[];
  _embedded?: {
    'wp:featuredmedia'?: { source_url: string; alt_text: string }[];
  };
};

type WpTerm = {
  id: number;
  name: string;
  slug: string;
};

type WpComment = {
  id: number;
  post: number;
  author_name: string;
  date: string;
  content: { rendered: string };
};
