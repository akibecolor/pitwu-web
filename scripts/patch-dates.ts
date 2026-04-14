/**
 * 全記事に wpDate フィールドをセットする
 * microCMS に wpDate (テキスト) フィールドを追加済みであること
 *
 * 実行: npx tsx scripts/patch-dates.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';

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

function load<T>(filename: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf-8')) as T;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

type WpPost = { id: number; date: string };

const wpPosts = load<WpPost[]>('wp-posts.json');
const articleMap = load<Record<number, string>>('article-map.json');

// WP の date は "2023-06-15T10:00:00" 形式 — ISO 8601 文字列としてそのまま保存
const targets = wpPosts.filter(p => articleMap[p.id]);
console.log(`\n▶ wpDate を PATCH 中: ${targets.length} 件`);

let success = 0;
let fail = 0;

for (let i = 0; i < targets.length; i++) {
  const post = targets[i];
  const microcmsId = articleMap[post.id];

  try {
    const res = await fetch(`${BASE_URL}/articles/${microcmsId}`, {
      method: 'PATCH',
      headers: {
        'X-MICROCMS-API-KEY': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ wpDate: post.date }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} ${text}`);
    }

    success++;
    if (i % 100 === 0) console.log(`  ${i + 1} / ${targets.length} 件...`);
    await sleep(300);
  } catch (e) {
    const msg = String(e);
    if (msg.includes('429')) {
      console.warn(`  ⏳ レートリミット [${post.id}] — 5秒待機してリトライ`);
      await sleep(5000);
      try {
        const res2 = await fetch(`${BASE_URL}/articles/${microcmsId}`, {
          method: 'PATCH',
          headers: {
            'X-MICROCMS-API-KEY': API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ wpDate: post.date }),
        });
        if (!res2.ok) throw new Error(await res2.text());
        success++;
        await sleep(300);
        continue;
      } catch (e2) {
        console.error(`  ✗ リトライ失敗 [${post.id}] ${microcmsId}:`, e2);
      }
    } else {
      console.error(`  ✗ [${post.id}] ${microcmsId}:`, msg);
    }
    fail++;
  }
}

console.log(`\n✅ 完了: 成功 ${success} 件 / 失敗 ${fail} 件`);
