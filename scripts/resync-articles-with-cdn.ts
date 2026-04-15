/**
 * 記事コンテンツを WP から再取得し、画像URLを microCMS CDN に書き換えて再PATCH
 *
 * 背景: sync-wp-content.ts で相対パス (/wp-content/uploads/...) で PATCH したら
 * microCMS のリッチエディタが img タグを全部削除してしまった。
 * 画像は別途 microCMS CDN にアップ済み (logs/image-mapping.json) なので、
 * pitwu.com URL → CDN URL に直接書き換えた版で再PATCH する。
 *
 * 同時にアイキャッチ（1枚目の画像のCDN URL）も設定する。
 *
 * 実行: npx tsx scripts/resync-articles-with-cdn.ts
 * 再実行時は logs/resync-progress.json を見てレジューム
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { requireMicroCmsEnv } from './lib/env.js';
import { delay, tsLog as log } from './lib/util.js';

const { domain: DOMAIN, apiKey: API_KEY } = requireMicroCmsEnv();

const MAPPING_PATH       = join(process.cwd(), 'logs', 'image-mapping.json');           // pitwu.com 由来
const EXT_MAPPING_PATH   = join(process.cwd(), 'logs', 'external-image-mapping.json');   // st-note.com 等
const PROGRESS_PATH      = join(process.cwd(), 'logs', 'resync-progress.json');
const FAILED_PATH        = join(process.cwd(), 'logs', 'resync-failed.json');

// ---- マッピング読込 ----
// pitwu マッピング: キー "/wp-content/uploads/..." → CDN URL
const mapping: Record<string, string> = existsSync(MAPPING_PATH)
  ? JSON.parse(readFileSync(MAPPING_PATH, 'utf-8'))
  : {};
// 外部画像マッピング: キー 完全URL (https://assets.st-note.com/... など) → CDN URL
const extMapping: Record<string, string> = existsSync(EXT_MAPPING_PATH)
  ? JSON.parse(readFileSync(EXT_MAPPING_PATH, 'utf-8'))
  : {};
log(`pitwu マッピング: ${Object.keys(mapping).length}件 / 外部マッピング: ${Object.keys(extMapping).length}件`);

// ---- 進捗読込 ----
const done: Set<string> = existsSync(PROGRESS_PATH)
  ? new Set(JSON.parse(readFileSync(PROGRESS_PATH, 'utf-8')))
  : new Set();

function saveProgress() {
  writeFileSync(PROGRESS_PATH, JSON.stringify([...done], null, 2));
}

// ---- WP REST fetch ----
async function fetchWP(wpPostId: number): Promise<string | null> {
  try {
    const r = await fetch(`https://pitwu.com/wp-json/wp/v2/posts/${wpPostId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const d = await r.json() as { content?: { rendered?: string } };
    return d.content?.rendered ?? null;
  } catch { return null; }
}

// ---- img タグを簡素化（余計な data-*, srcset, sizes 属性を削る）----
function cleanImg(html: string): string {
  return html.replace(/<img\s([^>]*?)\s*\/?>/g, (_, attrs) => {
    const src = attrs.match(/\bsrc="([^"]*)"/)?.[1] || '';
    const alt = attrs.match(/\balt="([^"]*)"/)?.[1] || '';
    const w   = attrs.match(/\bwidth="([^"]*)"/)?.[1] || '';
    const h   = attrs.match(/\bheight="([^"]*)"/)?.[1] || '';
    let out = `<img src="${src}"`;
    if (alt) out += ` alt="${alt}"`;
    if (w)   out += ` width="${w}"`;
    if (h)   out += ` height="${h}"`;
    return out + '>';
  });
}

// ---- 画像URLを CDN URLに置換（pitwu.com + 外部）----
function rewriteToCdn(html: string): { content: string; firstCdn: string | null; hit: number; miss: number } {
  let hit = 0, miss = 0;
  let firstCdn: string | null = null;

  // 1. pitwu.com URL → 相対パス → CDN URL
  let rewritten = html.replace(
    /(?:https?:)?\/\/pitwu\.com(\/wp-content\/uploads\/[^\s"'<>)]+)/g,
    (_, relPath) => {
      const cdn = mapping[relPath];
      if (cdn) {
        hit++;
        if (!firstCdn && /\.(jpe?g|png|gif|webp|svg|avif)$/i.test(relPath)) firstCdn = cdn;
        return cdn;
      }
      miss++;
      return _;
    }
  );

  // 2. 外部URL（st-note.com 等）→ CDN URL
  // 完全一致で置換するため、マッピングのキーをそのまま検索
  for (const [extUrl, cdnUrl] of Object.entries(extMapping)) {
    if (!rewritten.includes(extUrl)) continue;
    const escaped = extUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rewritten = rewritten.replace(new RegExp(escaped, 'g'), cdnUrl);
    hit++;
    if (!firstCdn) firstCdn = cdnUrl;
  }

  return { content: rewritten, firstCdn, hit, miss };
}

// ---- microCMS 全記事取得 ----
async function fetchAllArticles() {
  const all: { id: string; wpPostId?: number; eyecatch?: { url: string } }[] = [];
  let off = 0;
  while (true) {
    const r = await fetch(
      `https://${DOMAIN}.microcms.io/api/v1/articles?limit=100&offset=${off}&fields=id,wpPostId,eyecatch`,
      { headers: { 'X-MICROCMS-API-KEY': API_KEY } }
    );
    const d = await r.json() as { contents: typeof all; totalCount: number };
    all.push(...d.contents);
    if (all.length >= d.totalCount) break;
    off += 100;
  }
  return all;
}

// ---- PATCH ----
async function patch(id: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; msg?: string }> {
  try {
    const r = await fetch(
      `https://${DOMAIN}.microcms.io/api/v1/articles/${id}`,
      {
        method: 'PATCH',
        headers: { 'X-MICROCMS-API-KEY': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      }
    );
    if (r.ok) return { ok: true, status: r.status };
    return { ok: false, status: r.status, msg: (await r.text()).slice(0, 150) };
  } catch (e) {
    return { ok: false, status: 0, msg: String(e).slice(0, 100) };
  }
}

// ========================================
log('=== 記事再同期 (CDN URL版) 開始 ===');
const articles = await fetchAllArticles();
log(`全記事: ${articles.length}件 / 処理済み: ${done.size}件`);

const targets = articles.filter(a => a.wpPostId && !done.has(a.id));
log(`今回処理: ${targets.length}件\n`);

let ok = 0, skip = 0, err = 0;
let totalHit = 0, totalMiss = 0;
const failed: { id: string; wpPostId: number; reason: string }[] = [];

for (let i = 0; i < targets.length; i++) {
  const art = targets[i];
  const tag = `[${i + 1}/${targets.length}]`;

  const wpHtml = await fetchWP(art.wpPostId!);
  if (!wpHtml) {
    log(`${tag} SKIP(WP取得失敗) cms=${art.id} wp=${art.wpPostId}`);
    skip++;
    done.add(art.id);
    await delay(300);
    continue;
  }

  const cleaned = cleanImg(wpHtml);
  const { content, firstCdn, hit, miss } = rewriteToCdn(cleaned);
  totalHit += hit; totalMiss += miss;

  const body: Record<string, unknown> = { content };
  if (firstCdn && !art.eyecatch?.url) body.eyecatch = firstCdn;

  const r = await patch(art.id, body);
  if (r.ok) {
    log(`${tag} OK cms=${art.id} wp=${art.wpPostId} 画像${hit}件 eye=${body.eyecatch ? 'Y' : 'skip'}`);
    ok++;
    done.add(art.id);
    if (ok % 20 === 0) saveProgress();
  } else {
    log(`${tag} ERROR(${r.status}) cms=${art.id}: ${r.msg}`);
    err++;
    failed.push({ id: art.id, wpPostId: art.wpPostId!, reason: `${r.status} ${r.msg ?? ''}` });
    if (r.status === 429) { log('  レートリミット - 10秒待機'); await delay(10000); i--; continue; }
  }

  await delay(700);
}

saveProgress();
if (failed.length) writeFileSync(FAILED_PATH, JSON.stringify(failed, null, 2));

log('\n=== 完了 ===');
log(`成功: ${ok} / スキップ: ${skip} / エラー: ${err}`);
log(`画像マッピング ヒット: ${totalHit} / ミス: ${totalMiss}`);
if (failed.length) log(`失敗リスト → ${FAILED_PATH}`);
