/**
 * 小さい画像（絵文字等）がアイキャッチになっている記事を修正
 * 1. eyecatch.width または height < 100px の記事を抽出
 * 2. content 内の img を順に試し、十分大きい画像が見つかれば差替
 * 3. 見つからなければ eyecatch を null に戻す
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const raw = readFileSync(join(process.cwd(), '.env'), 'utf-8');
const env: Record<string, string> = {};
for (const line of raw.split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('='); if (i === -1) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '');
}
const D = env.MICROCMS_SERVICE_DOMAIN, K = env.MICROCMS_API_KEY;

const MIN = 100;
const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

type Article = { id: string; title: string; content?: string; eyecatch?: { url: string; width: number; height: number } };

async function fetchAll(): Promise<Article[]> {
  const all: Article[] = []; let off = 0;
  while (true) {
    const r = await fetch(`https://${D}.microcms.io/api/v1/articles?limit=100&offset=${off}&fields=id,title,content,eyecatch`, {
      headers: { 'X-MICROCMS-API-KEY': K },
    });
    const d = await r.json() as { contents: Article[]; totalCount: number };
    all.push(...d.contents);
    if (all.length >= d.totalCount) break;
    off += 100;
  }
  return all;
}

async function patchAndCheck(id: string, body: Record<string, unknown>): Promise<{ ok: boolean; eyecatch?: Article['eyecatch'] }> {
  const r = await fetch(`https://${D}.microcms.io/api/v1/articles/${id}`, {
    method: 'PATCH',
    headers: { 'X-MICROCMS-API-KEY': K, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) return { ok: false };
  await delay(400);
  const c = await fetch(`https://${D}.microcms.io/api/v1/articles/${id}?fields=eyecatch`, { headers: { 'X-MICROCMS-API-KEY': K } });
  const d = await c.json() as { eyecatch?: Article['eyecatch'] };
  return { ok: true, eyecatch: d.eyecatch };
}

const arts = await fetchAll();
log(`記事 ${arts.length}件 取得`);

const small = arts.filter(a => a.eyecatch && (a.eyecatch.width < MIN || a.eyecatch.height < MIN));
log(`小さいアイキャッチ: ${small.length}件 (<${MIN}px)`);

let fixed = 0, cleared = 0, failed = 0;

for (let i = 0; i < small.length; i++) {
  const a = small[i];
  const tag = `[${i+1}/${small.length}]`;

  // content 内の img URLを順に取得
  const imgs = [...(a.content || '').matchAll(/<img[^>]+src="(https:\/\/images\.microcms-assets\.io[^"]+)"/g)].map(m => m[1]);
  // 現アイキャッチと同じものはスキップ対象
  const candidates = imgs.filter(u => u !== a.eyecatch?.url);

  let found: string | null = null;
  let foundDim: { width: number; height: number } | null = null;

  for (const url of candidates) {
    const r = await patchAndCheck(a.id, { eyecatch: url });
    if (!r.ok) continue;
    const ec = r.eyecatch;
    if (ec && ec.width >= MIN && ec.height >= MIN) {
      found = url;
      foundDim = { width: ec.width, height: ec.height };
      break;
    }
  }

  if (found) {
    log(`${tag} ✓ ${a.id} ${a.title.slice(0,30)} → ${foundDim?.width}x${foundDim?.height}`);
    fixed++;
  } else {
    // 候補なし → eyecatch をクリア
    const r = await patchAndCheck(a.id, { eyecatch: null });
    if (r.ok) {
      log(`${tag} - ${a.id} ${a.title.slice(0,30)} → クリア（候補無し）`);
      cleared++;
    } else {
      log(`${tag} ✗ ${a.id} 失敗`);
      failed++;
    }
  }
  await delay(400);
}

log(`\n=== 完了 ===`);
log(`差替成功: ${fixed} / クリア: ${cleared} / 失敗: ${failed}`);
