/**
 * WordPress データを microCMS に一括登録する
 * カテゴリ → タグ → 記事 の順で実行
 *
 * 実行: npx tsx scripts/upload-to-microcms.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// .env を手動で読み込む（Astro外での実行のため）
const env = Object.fromEntries(
  readFileSync(join(process.cwd(), '.env'), 'utf-8')
    .trim()
    .split('\n')
    .map(l => l.split('='))
);

const SERVICE_DOMAIN = env.MICROCMS_SERVICE_DOMAIN;
const API_KEY = env.MICROCMS_API_KEY;
const BASE_URL = `https://${SERVICE_DOMAIN}.microcms.io/api/v1`;
const DATA_DIR = join(process.cwd(), 'scripts/data');

// microCMS Management API でコンテンツを作成
async function createContent(endpoint: string, body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${BASE_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      'X-MICROCMS-API-KEY': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${endpoint} failed: ${res.status} ${text}`);
  }

  const data = await res.json() as { id: string };
  return data.id;
}

// レート制限対策（無料プランは低速）
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function load<T>(filename: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf-8')) as T;
}

function save(filename: string, data: unknown) {
  writeFileSync(join(DATA_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
}

// ---- 型定義 ----
type WpPost = {
  id: number;
  date: string;
  slug: string;
  title: { rendered: string };
  content: { rendered: string };
  featured_media: number;
  categories: number[];
  tags: number[];
  _embedded?: {
    'wp:featuredmedia'?: { source_url: string }[];
  };
};

type WpTerm = { id: number; name: string; slug: string };

// ========================================
// 1. カテゴリをアップロード
// ========================================
console.log('\n▶ カテゴリをアップロード中...');
const wpCategories = load<WpTerm[]>('wp-categories.json');

// WordPress ID → microCMS ID のマッピング
const categoryMap: Record<number, string> = {};

for (const cat of wpCategories) {
  try {
    const slug = cat.slug.includes('%') ? decodeURIComponent(cat.slug) : cat.slug;
    const id = await createContent('categories', { name: cat.name, slug });
    categoryMap[cat.id] = id;
    console.log(`  ✔ ${cat.name} → ${id}`);
    await sleep(300);
  } catch (e) {
    console.error(`  ✗ ${cat.name}:`, e);
  }
}
save('category-map.json', categoryMap);
console.log(`カテゴリ完了: ${Object.keys(categoryMap).length} 件`);

// ========================================
// 2. タグをアップロード
// ========================================
console.log('\n▶ タグをアップロード中...');
const wpTags = load<WpTerm[]>('wp-tags.json');
const tagMap: Record<number, string> = {};

for (let i = 0; i < wpTags.length; i++) {
  const tag = wpTags[i];
  try {
    const id = await createContent('tags', { name: tag.name, slug: tag.slug });
    tagMap[tag.id] = id;
    if (i % 50 === 0) console.log(`  ${i + 1} / ${wpTags.length} 件...`);
    await sleep(300);
  } catch (e) {
    console.error(`  ✗ ${tag.name}:`, e);
  }
}
save('tag-map.json', tagMap);
console.log(`タグ完了: ${Object.keys(tagMap).length} 件`);

// ========================================
// 3. 記事をアップロード
// ========================================
console.log('\n▶ 記事をアップロード中...');
const wpPosts = load<WpPost[]>('wp-posts.json');
const articleMap: Record<number, string> = {};
const failed: number[] = [];

for (let i = 0; i < wpPosts.length; i++) {
  const post = wpPosts[i];

  // カテゴリ・タグを microCMS IDに変換
  const category = post.categories[0] ? categoryMap[post.categories[0]] : undefined;
  // microCMS の複数コンテンツ参照はカンマ区切り文字列で指定
  const tagIds = post.tags
    .map(id => tagMap[id])
    .filter((id): id is string => Boolean(id))
    .join(',');

  const body: Record<string, unknown> = {
    title: post.title.rendered,
    slug: decodeURIComponent(post.slug), // URLエンコード済みスラッグを正規化
    content: post.content.rendered,
    wpPostId: post.id,
  };

  if (category) body.category = category;
  if (tagIds) body.tags = tagIds;

  try {
    const id = await createContent('articles', body);
    articleMap[post.id] = id;
    if (i % 50 === 0) console.log(`  ${i + 1} / ${wpPosts.length} 件... (直近: ${post.slug})`);
    await sleep(300);
  } catch (e) {
    console.error(`  ✗ [${post.id}] ${post.slug}:`, e);
    failed.push(post.id);
  }
}

save('article-map.json', articleMap);
if (failed.length) save('failed-articles.json', failed);

console.log(`\n✅ 記事完了: ${Object.keys(articleMap).length} / ${wpPosts.length} 件`);
if (failed.length) console.log(`⚠ 失敗: ${failed.length} 件 → scripts/data/failed-articles.json`);
