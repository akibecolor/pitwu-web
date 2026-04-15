/**
 * 移転記事内で WordPress にあった Twitter/X 埋め込みが microCMS で欠落している記事を検出
 * 結果: logs/missing-tweets.json
 */
import { writeFileSync } from 'fs';
import { requireMicroCmsEnv } from './lib/env.js';
import { tsLog as log } from './lib/util.js';

const { domain: D, apiKey: K } = requireMicroCmsEnv();

const all: { id: string; title: string; wpPostId?: number; content?: string }[] = [];
let off = 0;
while (true) {
  const r = await fetch(`https://${D}.microcms.io/api/v1/articles?limit=100&offset=${off}&fields=id,title,wpPostId,content`, { headers: { 'X-MICROCMS-API-KEY': K } });
  const d = await r.json() as { contents: typeof all; totalCount: number };
  all.push(...d.contents);
  if (all.length >= d.totalCount) break;
  off += 100;
}
const targets = all.filter(a => a.wpPostId);
log(`スキャン対象: ${targets.length}件`);

const missing: { id: string; title: string; wpPostId: number; missingIds: string[] }[] = [];
let done = 0, withTweets = 0;

for (const a of targets) {
  done++;
  try {
    const r = await fetch(`https://pitwu.com/wp-json/wp/v2/posts/${a.wpPostId}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) continue;
    const wp = await r.json() as { content?: { rendered?: string } };
    const wpC = wp.content?.rendered || '';

    const ids = new Set<string>();
    for (const m of wpC.matchAll(/(?:twitter|x)\.com\/[^/"\s]+\/status(?:es)?\/(\d+)/g)) ids.add(m[1]);
    for (const m of wpC.matchAll(/platform\.twitter\.com\/embed\/Tweet\.html\?id=(\d+)/g)) ids.add(m[1]);
    if (ids.size === 0) continue;
    withTweets++;

    const cmsC = a.content || '';
    const missingIds = [...ids].filter(id => !cmsC.includes(id));
    if (missingIds.length) {
      missing.push({ id: a.id, title: a.title, wpPostId: a.wpPostId!, missingIds });
    }
  } catch {}
  if (done % 100 === 0) {
    log(`  ${done}/${targets.length} (tweet含: ${withTweets} / 欠落: ${missing.length})`);
    writeFileSync('logs/missing-tweets.json', JSON.stringify(missing, null, 2));
  }
  await new Promise(r => setTimeout(r, 80));
}

writeFileSync('logs/missing-tweets.json', JSON.stringify(missing, null, 2));
log(`\n=== 完了 ===`);
log(`Tweet含むWP記事: ${withTweets}件 / うち欠落あり: ${missing.length}件`);
log(`総欠落tweet数: ${missing.reduce((s, m) => s + m.missingIds.length, 0)}`);
log(`例:`);
missing.slice(0, 10).forEach(m => log(`  [${m.id}] ${m.title.slice(0, 35)}: ${m.missingIds.length}件`));
