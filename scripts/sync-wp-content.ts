/**
 * WordPress記事の画像込みコンテンツを microCMS に同期するスクリプト
 *
 * 処理フロー:
 *   1. microCMS から全記事 (wpPostId + content) を取得
 *   2. WordPress REST API でコンテンツ取得
 *   3. 画像を public/wp-content/uploads/ にダウンロード（既存はスキップ）
 *   4. pitwu.com の絶対URLを相対パスに書き換え
 *   5. microCMS に PATCH で更新
 *
 * 実行: npx tsx scripts/sync-wp-content.ts
 * ログ: logs/sync-wp-content.log
 */

import { mkdirSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { requireMicroCmsEnv } from './lib/env.js';
import { delay } from './lib/util.js';

const { domain: DOMAIN, apiKey: API_KEY } = requireMicroCmsEnv();

// ---- ログ ----
mkdirSync(join(process.cwd(), 'logs'), { recursive: true });
const LOG_PATH = join(process.cwd(), 'logs', 'sync-wp-content.log');
// 既存ログをクリア
writeFileSync(LOG_PATH, '');

// ファイル出力も伴うため tsLog ではなくローカル定義
function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG_PATH, line + '\n');
}

// ---- microCMS: 全記事取得 ----
async function fetchAllCMSArticles() {
  const limit = 100;
  let offset = 0;
  const all: { id: string; wpPostId?: number; content?: string }[] = [];
  while (true) {
    const res = await fetch(
      `https://${DOMAIN}.microcms.io/api/v1/articles?limit=${limit}&offset=${offset}&fields=id,wpPostId,content`,
      { headers: { 'X-MICROCMS-API-KEY': API_KEY } }
    );
    const data = await res.json() as { contents: typeof all; totalCount: number };
    all.push(...data.contents);
    if (all.length >= data.totalCount) break;
    offset += limit;
  }
  return all;
}

// ---- WordPress REST API: コンテンツ取得 ----
async function fetchWPContent(wpPostId: number): Promise<string | null> {
  try {
    const res = await fetch(`https://pitwu.com/wp-json/wp/v2/posts/${wpPostId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 404) return null; // 記事が存在しない
    if (!res.ok) return null;
    const data = await res.json() as { content?: { rendered?: string } };
    return data.content?.rendered ?? null;
  } catch {
    return null;
  }
}

// ---- 画像URL抽出（pitwu.com 限定）----
function extractImageUrls(html: string): string[] {
  const pat = /(?:https?:)?\/\/pitwu\.com\/wp-content\/uploads\/[^\s"'<>)]+/g;
  const found = html.match(pat) ?? [];
  return [...new Set(found.map(u => u.startsWith('//') ? 'https:' + u : u))];
}

// ---- 画像ダウンロード ----
async function downloadImage(url: string): Promise<'ok' | 'skip' | 'error'> {
  const match = url.match(/\/wp-content\/uploads\/.+/);
  if (!match) return 'error';
  const destPath = join(process.cwd(), 'public', match[0]);
  if (existsSync(destPath)) return 'skip';
  try {
    mkdirSync(dirname(destPath), { recursive: true });
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return 'error';
    writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
    return 'ok';
  } catch {
    return 'error';
  }
}

// ---- HTML 内の pitwu.com 絶対URL → 相対パスに書き換え ----
function rewriteUrls(html: string): string {
  return html
    .replace(/https?:\/\/pitwu\.com\/wp-content\/uploads\//g, '/wp-content/uploads/')
    .replace(/\/\/pitwu\.com\/wp-content\/uploads\//g, '/wp-content/uploads/');
}

// ---- microCMS PATCH ----
async function patchCMS(articleId: string, content: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://${DOMAIN}.microcms.io/api/v1/articles/${articleId}`,
      {
        method: 'PATCH',
        headers: { 'X-MICROCMS-API-KEY': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

// ============================================================
// メイン処理
// ============================================================
log('=== WordPress → microCMS 画像同期 開始 ===');

log('microCMS から全記事を取得中...');
const allArticles = await fetchAllCMSArticles();
log(`取得完了: ${allArticles.length} 件`);

const targets = allArticles.filter(a => a.wpPostId);
log(`wpPostId あり: ${targets.length} 件 / なし: ${allArticles.length - targets.length} 件\n`);

let cntOk = 0, cntSkip = 0, cntErr = 0;
let imgOk = 0, imgSkip = 0, imgErr = 0;

for (let i = 0; i < targets.length; i++) {
  const article = targets[i];
  const tag = `[${i + 1}/${targets.length}]`;

  // WordPress からコンテンツ取得
  const wpContent = await fetchWPContent(article.wpPostId!);
  if (!wpContent) {
    log(`${tag} SKIP(WP取得失敗) cms=${article.id} wp=${article.wpPostId}`);
    cntSkip++;
    await delay(300);
    continue;
  }

  // 画像URL抽出 & ダウンロード
  const imageUrls = extractImageUrls(wpContent);
  for (const url of imageUrls) {
    const result = await downloadImage(url);
    if (result === 'ok')    imgOk++;
    else if (result === 'skip') imgSkip++;
    else imgErr++;
  }

  // URL 書き換え
  const newContent = rewriteUrls(wpContent);

  // 変更がなければスキップ（既に同期済み）
  if (article.content?.trim() === newContent.trim()) {
    log(`${tag} SKIP(変更なし) cms=${article.id}`);
    cntSkip++;
    await delay(150);
    continue;
  }

  // microCMS 更新
  const ok = await patchCMS(article.id, newContent);
  if (ok) {
    log(`${tag} OK cms=${article.id} wp=${article.wpPostId} 画像${imageUrls.length}件`);
    cntOk++;
  } else {
    log(`${tag} ERROR(PATCH失敗) cms=${article.id}`);
    cntErr++;
  }

  // レートリミット対策
  await delay(600);
}

log('\n=== 完了 ===');
log(`記事: 更新${cntOk}件 / スキップ${cntSkip}件 / エラー${cntErr}件`);
log(`画像: DL${imgOk}件 / スキップ(既存)${imgSkip}件 / エラー${imgErr}件`);
log(`ログ: ${LOG_PATH}`);
