/**
 * 1記事だけで画像アップロード + URL置換 + アイキャッチ設定を試すテストスクリプト
 *
 * 実行: npx tsx scripts/test-single-article-upload.ts [articleId]
 * articleId を省略した場合、画像を含む最初の記事が自動選択されます
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { requireMicroCmsEnv } from './lib/env.js';
import { delay, tsLog as log } from './lib/util.js';
import { getMimeType as getMime } from './lib/microcms.js';

const { domain: DOMAIN, apiKey: API_KEY } = requireMicroCmsEnv();

// ---- microCMS 画像アップロード ----
async function uploadImage(filePath: string): Promise<string | null> {
  const fileName = filePath.split(/[/\\]/).pop()!;
  const buf = readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([buf], { type: getMime(fileName) }), fileName);
  const res = await fetch(
    `https://${DOMAIN}.microcms-management.io/api/v1/media`,
    { method: 'POST', headers: { 'X-MICROCMS-API-KEY': API_KEY }, body: form, signal: AbortSignal.timeout(60000) }
  );
  if (!res.ok) { log(`  UPLOAD ERROR ${res.status}: ${(await res.text()).slice(0,120)}`); return null; }
  const data = await res.json() as { url?: string };
  return data.url ?? null;
}

// ---- 画像を含む記事を1件探す ----
async function findTargetArticle(preferId?: string) {
  if (preferId) {
    const res = await fetch(
      `https://${DOMAIN}.microcms.io/api/v1/articles/${preferId}?fields=id,title,content,eyecatch`,
      { headers: { 'X-MICROCMS-API-KEY': API_KEY } }
    );
    if (!res.ok) throw new Error(`記事取得失敗: ${res.status}`);
    return await res.json() as { id: string; title: string; content: string; eyecatch?: { url: string } };
  }
  // 画像を含む最初の記事を探す
  const limit = 50;
  let offset = 0;
  while (offset < 1200) {
    const res = await fetch(
      `https://${DOMAIN}.microcms.io/api/v1/articles?limit=${limit}&offset=${offset}&fields=id,title,content,eyecatch`,
      { headers: { 'X-MICROCMS-API-KEY': API_KEY } }
    );
    const data = await res.json() as { contents: { id: string; title: string; content: string; eyecatch?: { url: string } }[]; totalCount: number };
    for (const a of data.contents) {
      if (a.content && /\/wp-content\/uploads\/[^\s"'<>)]+\.(jpe?g|png|gif|webp|svg|avif)/i.test(a.content)) return a;
    }
    offset += limit;
    if (offset >= data.totalCount) break;
  }
  throw new Error('画像を含む記事が見つかりませんでした');
}

// ---- メイン ----
const preferId = process.argv[2];
log(`=== テスト実行 ===`);
const article = await findTargetArticle(preferId);
log(`対象記事: ${article.id} / ${article.title}`);

// 画像URL抽出（ユニーク）
const imgUrls = [...new Set(
  (article.content.match(/\/wp-content\/uploads\/[^\s"'<>)]+\.(?:jpe?g|png|gif|webp|svg|avif)/gi) || [])
)];
log(`画像URL: ${imgUrls.length}件（ユニーク）`);

// 1枚目の画像URL（content 内で最初に出現するもの）
const firstImg = article.content.match(/\/wp-content\/uploads\/[^\s"'<>)]+\.(?:jpe?g|png|gif|webp|svg|avif)/i)?.[0];
log(`1枚目: ${firstImg}`);

// 画像アップロード
const urlMap: Record<string,string> = {};
let firstCdnUrl: string | null = null;
for (let i = 0; i < imgUrls.length; i++) {
  const url = imgUrls[i];
  const localPath = join(process.cwd(), 'public', url);
  if (!existsSync(localPath)) {
    log(`  [${i+1}/${imgUrls.length}] SKIP（ローカルに無い）: ${url}`);
    continue;
  }
  const cdn = await uploadImage(localPath);
  if (!cdn) {
    log(`  [${i+1}/${imgUrls.length}] FAIL: ${url}`);
    continue;
  }
  urlMap[url] = cdn;
  if (url === firstImg) firstCdnUrl = cdn;
  log(`  [${i+1}/${imgUrls.length}] OK: ${url} → ${cdn}`);
  await delay(300);
}

log(`\nアップロード完了: ${Object.keys(urlMap).length}/${imgUrls.length}件`);

// 記事content のURL置換
let newContent = article.content;
for (const [local, cdn] of Object.entries(urlMap)) {
  const esc = local.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  newContent = newContent.replace(new RegExp(esc, 'g'), cdn);
}

// PATCH（contentとeyecatch）
const patchBody: Record<string, unknown> = { content: newContent };
if (firstCdnUrl) patchBody.eyecatch = firstCdnUrl;

log(`\nPATCH 実行 (content更新 + eyecatch=${firstCdnUrl ?? 'なし'})`);
const patchRes = await fetch(
  `https://${DOMAIN}.microcms.io/api/v1/articles/${article.id}`,
  {
    method: 'PATCH',
    headers: { 'X-MICROCMS-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(patchBody),
  }
);

if (patchRes.ok) {
  log(`✓ 成功: ${article.id}`);
} else {
  const txt = await patchRes.text();
  log(`✗ 失敗: ${patchRes.status} ${txt.slice(0, 200)}`);
  process.exit(1);
}

// 結果確認
await delay(1000);
const verifyRes = await fetch(
  `https://${DOMAIN}.microcms.io/api/v1/articles/${article.id}?fields=id,title,content,eyecatch`,
  { headers: { 'X-MICROCMS-API-KEY': API_KEY } }
);
const verified = await verifyRes.json() as { eyecatch?: { url: string; width: number; height: number }; content: string };
log(`\n=== 検証 ===`);
log(`eyecatch.url: ${verified.eyecatch?.url ?? '(未設定)'}`);
log(`eyecatch サイズ: ${verified.eyecatch?.width ?? '?'}x${verified.eyecatch?.height ?? '?'}`);
const remainingLocal = (verified.content.match(/\/wp-content\/uploads\//g) || []).length;
log(`残存するローカルパス: ${remainingLocal}件`);
log(`microCMS CDN URL: ${(verified.content.match(/images\.microcms-assets\.io/g) || []).length}件`);
log(`\n記事ID: ${article.id}  — microCMS 管理画面で確認してください`);
