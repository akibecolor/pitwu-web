/**
 * 失敗した記事だけを再アップロードする
 * 前提: scripts/data/ に以下が存在すること
 *   - wp-posts.json
 *   - category-map.json
 *   - tag-map.json
 *   - article-map.json      (成功済み記事のマッピング)
 *   - failed-articles.json  (失敗したWordPress記事IDの配列)
 *
 * 実行: npx tsx scripts/reupload-failed.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { requireMicroCmsEnv } from './lib/env.js';
import { createMicroCmsClient } from './lib/microcms.js';
import { delay as sleep } from './lib/util.js';

const env = requireMicroCmsEnv();
const cms = createMicroCmsClient(env);
const DATA_DIR = join(process.cwd(), 'scripts/data');

const createContent = (endpoint: string, body: Record<string, unknown>) =>
  cms.create(endpoint, body);

function load<T>(filename: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf-8')) as T;
}

type WpPost = {
  id: number;
  date: string;
  slug: string;
  title: { rendered: string };
  content: { rendered: string };
  categories: number[];
  tags: number[];
};

// データ読み込み
const failedIds = new Set(load<number[]>('failed-articles.json'));
const wpPosts = load<WpPost[]>('wp-posts.json');
const categoryMap = load<Record<number, string>>('category-map.json');
const tagMap = load<Record<number, string>>('tag-map.json');
const articleMap = load<Record<number, string>>('article-map.json');

const targetPosts = wpPosts.filter(p => failedIds.has(p.id));
console.log(`\n▶ 再アップロード対象: ${targetPosts.length} 件`);

const newFailed: number[] = [];

for (let i = 0; i < targetPosts.length; i++) {
  const post = targetPosts[i];

  const category = post.categories[0] ? categoryMap[post.categories[0]] : undefined;

  // microCMS の複数コンテンツ参照はカンマ区切り文字列で指定
  const tagIds = post.tags
    .map(id => tagMap[id])
    .filter((id): id is string => Boolean(id))
    .join(',');

  const body: Record<string, unknown> = {
    title: post.title.rendered,
    slug: decodeURIComponent(post.slug),
    content: post.content.rendered,
    wpPostId: post.id,
  };

  if (category) body.category = category;
  if (tagIds) body.tags = tagIds;

  try {
    const id = await createContent('articles', body);
    articleMap[post.id] = id;
    if (i % 20 === 0) console.log(`  ${i + 1} / ${targetPosts.length} 件... (${post.slug})`);

    // レートリミット対策: 600ms待機（429エラー発生時は増やす）
    await sleep(600);
  } catch (e) {
    const msg = String(e);
    // 429の場合は長めに待ってリトライ
    if (msg.includes('429')) {
      console.warn(`  ⏳ レートリミット [${post.id}] — 5秒待機してリトライ`);
      await sleep(5000);
      try {
        const id = await createContent('articles', body);
        articleMap[post.id] = id;
        await sleep(600);
        continue;
      } catch (e2) {
        console.error(`  ✗ リトライ失敗 [${post.id}]:`, e2);
      }
    } else {
      console.error(`  ✗ [${post.id}] ${post.slug}:`, msg);
    }
    newFailed.push(post.id);
  }
}

// 結果を保存
writeFileSync(join(DATA_DIR, 'article-map.json'), JSON.stringify(articleMap, null, 2));
if (newFailed.length > 0) {
  writeFileSync(join(DATA_DIR, 'failed-articles.json'), JSON.stringify(newFailed, null, 2));
  console.log(`\n⚠ まだ失敗: ${newFailed.length} 件 → scripts/data/failed-articles.json`);
} else {
  writeFileSync(join(DATA_DIR, 'failed-articles.json'), '[]');
  console.log('\n✅ 全件アップロード完了');
}

console.log(`成功累計: ${Object.keys(articleMap).length} / ${wpPosts.length} 件`);
