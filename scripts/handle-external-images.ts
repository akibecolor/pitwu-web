/**
 * 外部ドメインの画像を microCMS CDN に取り込む
 *
 * 1. logs/all-image-srcs.json から外部URL を抽出
 * 2. ダウンロード可能なものを取得し microCMS にアップ
 * 3. 元URL → CDN URL マッピングを logs/external-image-mapping.json に保存
 *
 * このマッピングは resync-articles-with-cdn.ts が利用する想定
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { requireMicroCmsEnv } from './lib/env.js';
import { delay, tsLog as log } from './lib/util.js';

const { domain: D, apiKey: K } = requireMicroCmsEnv();

const SRCS_PATH = join(process.cwd(), 'logs', 'all-image-srcs.json');
const MAP_PATH  = join(process.cwd(), 'logs', 'external-image-mapping.json');
const FAIL_PATH = join(process.cwd(), 'logs', 'external-image-failed.json');

// 既存マッピング（レジューム）
const mapping: Record<string, string> = existsSync(MAP_PATH)
  ? JSON.parse(readFileSync(MAP_PATH, 'utf-8'))
  : {};

// ターゲット外部ドメイン（pitwu.com は別途処理済み、a8.net や mail.google.com はスキップ）
const SKIP_DOMAINS = ['pitwu.com', 'mail.google.com', 'www22.a8.net', 'www18.a8.net', 'images.microcms-assets.io'];

const data = JSON.parse(readFileSync(SRCS_PATH, 'utf-8')) as { urls: string[] };
const allUrls = data.urls;

// i*.wp.com (Jetpack Photon) は本来は元URLだが、結局 pitwu.com も含むので画像URLとして扱う
const targets = [...new Set(allUrls)].filter(url => {
  const m = url.match(/^(?:https?:)?\/\/([^\/]+)/);
  if (!m) return false;
  const dom = m[1];
  if (SKIP_DOMAINS.some(d => dom.includes(d))) return false;
  // 拡張子なし URL も画像とみなす（googleusercontent, twimg等）
  // 既知の非画像（emoji等）はSKIP_DOMAINSで除外済み
  return true;
}).filter(u => !mapping[u]); // 既処理スキップ

log(`未処理外部画像: ${targets.length}件`);

// MIME 推定
function getMime(url: string): string {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  const map: Record<string,string> = { jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',avif:'image/avif',bmp:'image/bmp' };
  return map[ext||''] ?? 'image/jpeg';
}

function getName(url: string): string {
  const path = url.split('?')[0];
  let fn = path.split('/').pop() || 'image.jpg';
  // 拡張子なしの場合は .jpg を補う（microCMSは拡張子必須）
  if (!/\.[a-z0-9]{2,5}$/i.test(fn)) fn += '.jpg';
  // ":large" のような twimg 末尾も除去
  fn = fn.replace(/:[a-z]+$/i, '');
  return fn.length > 100 ? fn.slice(-100) : fn;
}

async function downloadAndUpload(url: string): Promise<string | null | 'rate-limit'> {
  try {
    // HTML エンティティをデコード（&amp; → & など）
    const fetchUrl = url.replace(/&amp;/g, '&').replace(/&#038;/g, '&').replace(/&quot;/g, '"');
    const r = await fetch(fetchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) {
      log(`  DL FAIL ${r.status}: ${url.slice(0,80)}`);
      return null;
    }
    const buf = Buffer.from(await r.arrayBuffer());

    // microCMS にアップロード
    const fileName = getName(url);
    const mime = getMime(url);
    const form = new FormData();
    form.append('file', new Blob([buf], { type: mime }), fileName);

    const upRes = await fetch(
      `https://${D}.microcms-management.io/api/v1/media`,
      { method: 'POST', headers: { 'X-MICROCMS-API-KEY': K }, body: form, signal: AbortSignal.timeout(60000) }
    );
    if (upRes.status === 429) return 'rate-limit';
    if (!upRes.ok) {
      log(`  UP FAIL ${upRes.status}: ${(await upRes.text()).slice(0,120)}`);
      return null;
    }
    const data = await upRes.json() as { url?: string };
    return data.url ?? null;
  } catch (e) {
    log(`  EX: ${String(e).slice(0,80)}`);
    return null;
  }
}

const failed: { url: string; reason: string }[] = [];
let ok = 0, fail = 0;

for (let i = 0; i < targets.length; i++) {
  const url = targets[i];
  let cdn: string | null | 'rate-limit' = null;
  let retries = 0;

  while (retries < 3) {
    cdn = await downloadAndUpload(url);
    if (cdn === 'rate-limit') {
      log(`  [${i+1}] レートリミット待機 (10秒)`);
      await delay(10000);
      retries++;
      continue;
    }
    break;
  }

  if (cdn && cdn !== 'rate-limit') {
    mapping[url] = cdn;
    ok++;
    if (ok % 25 === 0) {
      writeFileSync(MAP_PATH, JSON.stringify(mapping, null, 2));
      log(`[${i+1}/${targets.length}] チェックポイント ${ok}件成功`);
    }
  } else {
    fail++;
    failed.push({ url, reason: cdn === 'rate-limit' ? 'rate-limit-exhausted' : 'fail' });
    if (fail <= 5 || fail % 20 === 0) log(`[${i+1}/${targets.length}] FAIL: ${url.slice(0,80)}`);
  }
  await delay(400);
}

writeFileSync(MAP_PATH, JSON.stringify(mapping, null, 2));
if (failed.length) writeFileSync(FAIL_PATH, JSON.stringify(failed, null, 2));

log(`\n=== 完了 ===`);
log(`成功 ${ok}件 / 失敗 ${fail}件`);
log(`マッピング: ${MAP_PATH}`);
