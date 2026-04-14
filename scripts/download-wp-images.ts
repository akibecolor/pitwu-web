/**
 * WordPressの画像をローカルに一括ダウンロードするスクリプト
 *
 * 対象:
 *   1. microCMS記事の content フィールド内の WordPress 画像URL
 *   2. 固定ページ (.astro) のハードコードURL（手動対応用にリスト表示のみ）
 *
 * ダウンロード先: public/wp-content/uploads/... (パス構造を保持)
 *
 * 実行: npx tsx scripts/download-wp-images.ts [--dry-run]
 */

import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { createWriteStream } from 'fs';

// ---- .env パース ----
const raw = readFileSync(join(process.cwd(), '.env'), 'utf-8');
const env: Record<string, string> = {};
for (const line of raw.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i === -1) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '');
}

const DOMAIN  = env.MICROCMS_SERVICE_DOMAIN;
const API_KEY = env.MICROCMS_API_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

if (!DOMAIN || !API_KEY) {
  console.error('❌ MICROCMS_SERVICE_DOMAIN または MICROCMS_API_KEY が未設定です');
  process.exit(1);
}

// ---- microCMS から全記事取得（contentフィールド込み）----
async function fetchAllArticles() {
  const limit = 100;
  let offset = 0;
  const all: { id: string; title: string; content?: string; eyecatch?: { url: string } }[] = [];

  while (true) {
    const url = `https://${DOMAIN}.microcms.io/api/v1/articles?limit=${limit}&offset=${offset}&fields=id,title,content,eyecatch`;
    const res = await fetch(url, { headers: { 'X-MICROCMS-API-KEY': API_KEY } });
    const data = await res.json() as { contents: typeof all; totalCount: number };
    all.push(...data.contents);
    if (all.length >= data.totalCount) break;
    offset += limit;
  }
  return all;
}

// ---- WordPress URL を抽出 ----
function extractWpUrls(html: string): string[] {
  const pattern = /https?:\/\/pitwu\.com\/wp-content\/uploads\/[^\s"'<>)]+/g;
  return [...new Set(html.match(pattern) ?? [])];
}

// ---- ファイルをダウンロード ----
async function download(url: string, destPath: string): Promise<'ok' | 'skip' | 'error'> {
  if (existsSync(destPath)) return 'skip';

  mkdirSync(dirname(destPath), { recursive: true });

  try {
    const res = await fetch(url);
    if (!res.ok) return 'error';
    const buf = await res.arrayBuffer();
    writeFileSync(destPath, Buffer.from(buf));
    return 'ok';
  } catch {
    return 'error';
  }
}

// ---- メイン ----
console.log('📥 microCMS から記事を取得中...');
const articles = await fetchAllArticles();
console.log(`  ${articles.length} 件取得\n`);

// 全URLを収集
const urlSet = new Set<string>();

for (const article of articles) {
  const content = article.content ?? '';
  extractWpUrls(content).forEach(u => urlSet.add(u));

  // アイキャッチが WordPress URL の場合
  const eyeUrl = article.eyecatch?.url ?? '';
  if (eyeUrl.includes('pitwu.com/wp-content')) urlSet.add(eyeUrl);
}

const urls = [...urlSet];
console.log(`🔍 WordPress画像URL: ${urls.length} 件\n`);

if (DRY_RUN) {
  console.log('【dry-run】ダウンロードは行いません。URL一覧:');
  urls.forEach(u => console.log(' ', u));
  process.exit(0);
}

// ダウンロード実行
let ok = 0, skip = 0, error = 0;
const errors: string[] = [];

for (const url of urls) {
  // URL から相対パスを取得: /wp-content/uploads/...
  const match = url.match(/\/wp-content\/uploads\/.+/);
  if (!match) continue;

  const relPath = match[0]; // /wp-content/uploads/2025/03/image.png
  const destPath = join(process.cwd(), 'public', relPath);
  const result = await download(url, destPath);

  if (result === 'ok') {
    ok++;
    process.stdout.write(`  ✅ ${relPath}\n`);
  } else if (result === 'skip') {
    skip++;
  } else {
    error++;
    errors.push(url);
    process.stdout.write(`  ❌ ${url}\n`);
  }
}

console.log(`\n完了: ダウンロード ${ok}件 / スキップ ${skip}件 / エラー ${error}件`);
if (errors.length > 0) {
  console.log('\nエラーURL:');
  errors.forEach(u => console.log(' ', u));
}
