/**
 * WordPress からダウンロードした画像を microCMS メディアAPIにアップロードし、
 * microCMS 記事内の /wp-content/uploads/... URLを CDN URLに書き換える
 *
 * 処理フロー:
 *   1. public/wp-content/uploads/ 以下の全ファイルをスキャン
 *   2. logs/image-mapping.json に未登録のファイルを microCMS メディアAPIにアップロード
 *   3. マッピング { "/wp-content/uploads/...": "https://images.microcms-assets.io/..." } を保存
 *   4. microCMS 全記事を取得し、/wp-content/uploads/... → CDN URL に置換して PATCH
 *
 * 実行: npx tsx scripts/upload-images-to-microcms.ts
 * 再実行時は自動でレジューム（アップロード済み/更新済みはスキップ）
 *
 * フェーズ指定:
 *   PHASE=upload  npx tsx scripts/upload-images-to-microcms.ts  (アップロードのみ)
 *   PHASE=patch   npx tsx scripts/upload-images-to-microcms.ts  (URL置換のみ)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { requireMicroCmsEnv } from './lib/env.js';
import { delay, tsLog as log, scanFiles } from './lib/util.js';
import { getMimeType } from './lib/microcms.js';

const { domain: DOMAIN, apiKey: API_KEY } = requireMicroCmsEnv();

const PHASE = process.env.PHASE ?? 'all'; // 'upload' | 'patch' | 'all'

const UPLOADS_DIR    = join(process.cwd(), 'public', 'wp-content', 'uploads');
const MAPPING_PATH   = join(process.cwd(), 'logs', 'image-mapping.json');
const FAILED_PATH    = join(process.cwd(), 'logs', 'image-upload-failed.json');

// ---- マッピング読み込み/保存 ----
function loadMapping(): Record<string, string> {
  if (existsSync(MAPPING_PATH)) {
    return JSON.parse(readFileSync(MAPPING_PATH, 'utf-8')) as Record<string, string>;
  }
  return {};
}

function saveMapping(mapping: Record<string, string>) {
  writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, 2), 'utf-8');
}

// ---- microCMS メディアアップロード ----
// 注: scripts/lib/microcms.ts の uploadMedia を使わず独自実装している理由
//   - レートリミット(429)時に文字列 'rate-limit' を返す必要がある（呼び出し側で待機+リトライ判定）
//   - 失敗時のエラーログを日本語の進捗ログに混ぜたい
async function uploadImage(filePath: string): Promise<string | null> {
  try {
    const fileName = filePath.split(/[/\\]/).pop()!;
    const mimeType = getMimeType(fileName);
    const fileBuffer = readFileSync(filePath);

    // FormData を手動構築（Node.js 18+ では FormData が組み込み）
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: mimeType });
    formData.append('file', blob, fileName);

    const res = await fetch(
      `https://${DOMAIN}.microcms-management.io/api/v1/media`,
      {
        method: 'POST',
        headers: { 'X-MICROCMS-API-KEY': API_KEY },
        body: formData,
        signal: AbortSignal.timeout(60000),
      }
    );

    if (res.status === 429) {
      return 'rate-limit';
    }

    if (!res.ok) {
      const text = await res.text();
      log(`  UPLOAD ERROR ${res.status}: ${text.slice(0, 120)}`);
      return null;
    }

    const data = await res.json() as { url?: string };
    return data.url ?? null;
  } catch (e) {
    log(`  UPLOAD EXCEPTION: ${e}`);
    return null;
  }
}

// ---- microCMS 全記事取得 ----
async function fetchAllArticles() {
  const limit = 100;
  let offset = 0;
  const all: { id: string; content?: string; eyecatch?: { url: string } }[] = [];
  while (true) {
    const res = await fetch(
      `https://${DOMAIN}.microcms.io/api/v1/articles?limit=${limit}&offset=${offset}&fields=id,content,eyecatch`,
      { headers: { 'X-MICROCMS-API-KEY': API_KEY } }
    );
    const data = await res.json() as { contents: typeof all; totalCount: number };
    all.push(...data.contents);
    if (all.length >= data.totalCount) break;
    offset += limit;
  }
  return all;
}

// ---- microCMS PATCH ----
async function patchArticle(id: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(
      `https://${DOMAIN}.microcms.io/api/v1/articles/${id}`,
      {
        method: 'PATCH',
        headers: { 'X-MICROCMS-API-KEY': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

// ============================================================
// Phase 1: アップロード
// ============================================================
async function phaseUpload() {
  log('=== Phase 1: 画像を microCMS にアップロード ===');

  if (!existsSync(UPLOADS_DIR)) {
    log(`❌ ${UPLOADS_DIR} が存在しません`);
    process.exit(1);
  }

  const mapping = loadMapping();
  const alreadyUploaded = new Set(Object.keys(mapping));

  log('ファイルスキャン中...');
  const allFiles = scanFiles(UPLOADS_DIR);
  log(`総ファイル数: ${allFiles.length} / 登録済み: ${alreadyUploaded.size}`);

  const pending = allFiles.filter(f => {
    // /wp-content/uploads/... の形式でキーを作る
    const rel = f.replace(/\\/g, '/').split('/public/wp-content/uploads/')[1];
    return rel && !alreadyUploaded.has(`/wp-content/uploads/${rel}`);
  });

  log(`未アップロード: ${pending.length} 件\n`);

  const failed: string[] = [];
  let cntOk = 0;

  for (let i = 0; i < pending.length; i++) {
    const filePath = pending[i];
    const rel = filePath.replace(/\\/g, '/').split('/public/wp-content/uploads/')[1];
    const key = `/wp-content/uploads/${rel}`;
    const tag = `[${i + 1}/${pending.length}]`;

    let cdnUrl: string | null = null;
    let retries = 0;

    while (retries < 3) {
      cdnUrl = await uploadImage(filePath);
      if (cdnUrl === 'rate-limit') {
        log(`${tag} レートリミット — 10秒待機...`);
        await delay(10000);
        retries++;
        continue;
      }
      break;
    }

    if (!cdnUrl || cdnUrl === 'rate-limit') {
      log(`${tag} ERROR: ${key}`);
      failed.push(key);
      await delay(500);
      continue;
    }

    mapping[key] = cdnUrl;
    cntOk++;

    // 50件ごとに保存（途中クラッシュ対策）
    if (cntOk % 50 === 0) {
      saveMapping(mapping);
      log(`${tag} 保存チェックポイント (${cntOk}件完了)`);
    } else if (i % 10 === 0) {
      log(`${tag} OK: ${key} → ${cdnUrl}`);
    }

    // レートリミット対策（microCMSのメディアAPIは厳しめ）
    await delay(300);
  }

  saveMapping(mapping);
  if (failed.length > 0) {
    writeFileSync(FAILED_PATH, JSON.stringify(failed, null, 2), 'utf-8');
    log(`\n⚠ 失敗: ${failed.length} 件 → ${FAILED_PATH}`);
  }

  log(`\n=== アップロード完了 ===`);
  log(`成功: ${cntOk}件 / 失敗: ${failed.length}件 / 登録済みスキップ: ${alreadyUploaded.size}件`);
  log(`マッピング保存先: ${MAPPING_PATH}`);
}

// ============================================================
// Phase 2: microCMS 記事の URL 置換
// ============================================================
async function phasePatch() {
  log('=== Phase 2: microCMS 記事の URL を CDN URL に置換 ===');

  if (!existsSync(MAPPING_PATH)) {
    log(`❌ ${MAPPING_PATH} が見つかりません。先に Phase 1 を実行してください。`);
    process.exit(1);
  }

  const mapping = loadMapping();
  const mappingEntries = Object.entries(mapping);
  log(`マッピング: ${mappingEntries.length} 件`);

  // 置換用の正規表現を事前生成（長いパスを先にマッチさせるためソート）
  const sortedEntries = mappingEntries
    .sort((a, b) => b[0].length - a[0].length);  // 長いパス優先

  log('microCMS から全記事を取得中...');
  const articles = await fetchAllArticles();
  log(`取得: ${articles.length} 件`);

  let cntOk = 0, cntSkip = 0, cntErr = 0;

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const content = article.content;

    if (!content || !content.includes('/wp-content/uploads/')) {
      cntSkip++;
      continue;
    }

    // 1枚目の画像URL（content 内で最初に出現するローカルパス）を抽出
    const firstImgMatch = content.match(/\/wp-content\/uploads\/[^\s"'<>)]+\.(?:jpe?g|png|gif|webp|svg|avif)/i);
    const firstLocal = firstImgMatch?.[0];
    const firstCdn = firstLocal ? mapping[firstLocal] : null;

    // /wp-content/uploads/... を CDN URL に置換
    let newContent = content;
    for (const [localPath, cdnUrl] of sortedEntries) {
      const escaped = localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      newContent = newContent.replace(new RegExp(escaped, 'g'), cdnUrl);
    }

    const contentChanged = newContent !== content;
    const needEyecatch = firstCdn && !article.eyecatch?.url;

    if (!contentChanged && !needEyecatch) {
      cntSkip++;
      continue;
    }

    const body: Record<string, unknown> = {};
    if (contentChanged) body.content = newContent;
    if (needEyecatch) body.eyecatch = firstCdn;

    const tag = `[${i + 1}/${articles.length}]`;
    const ok = await patchArticle(article.id, body);
    if (ok) {
      const parts = [];
      if (contentChanged) parts.push('content');
      if (needEyecatch) parts.push('eyecatch');
      log(`${tag} OK: ${article.id} (${parts.join('+')})`);
      cntOk++;
    } else {
      log(`${tag} ERROR: ${article.id}`);
      cntErr++;
    }

    await delay(600);
  }

  log(`\n=== URL 置換完了 ===`);
  log(`更新: ${cntOk}件 / スキップ: ${cntSkip}件 / エラー: ${cntErr}件`);
}

// ============================================================
// エントリーポイント
// ============================================================
if (PHASE === 'upload') {
  await phaseUpload();
} else if (PHASE === 'patch') {
  await phasePatch();
} else {
  await phaseUpload();
  log('');
  await phasePatch();
}
