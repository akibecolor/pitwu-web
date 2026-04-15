/**
 * 記事用画像（microCMS CDN にアップ済み）をローカルから削除
 * 固定ページ用画像（wp-pages.json で参照）は残す
 *
 * 実行前提: ../pitwu-web-archives/wp-content-uploads-full.zip でバックアップ済
 */

import { readFileSync, readdirSync, statSync, unlinkSync, rmdirSync } from 'fs';
import { join } from 'path';

const data = JSON.parse(readFileSync('./src/data/wp-pages.json', 'utf-8'));

const keep = new Set<string>();
function scan(html?: string) {
  if (!html) return;
  (html.match(/\/wp-content\/uploads\/[^\s"'<>)]+/g) || []).forEach(u => keep.add(u));
}
for (const s of data.songs as { content?: string }[]) scan(s.content);
for (const k of Object.keys(data)) {
  if (k === 'songs') continue;
  const v = data[k];
  if (v && typeof v === 'object' && 'content' in v) scan(v.content);
}
console.log(`保持対象: ${keep.size}件`);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

const root = './public';
const allFiles = walk('./public/wp-content/uploads')
  .map(p => p.replace(/\\/g, '/'));

let deleted = 0, kept = 0, deletedSize = 0;
for (const filePath of allFiles) {
  const rel = filePath.replace(/^\.?\/?public/, '');
  if (keep.has(rel)) {
    kept++;
  } else {
    const sz = statSync(filePath).size;
    unlinkSync(filePath);
    deleted++;
    deletedSize += sz;
    if (deleted % 500 === 0) process.stdout.write(`\r  削除中 ${deleted}/${allFiles.length - kept}`);
  }
}
console.log(`\n削除: ${deleted}件 (${(deletedSize/1024/1024).toFixed(1)}MB)`);
console.log(`残存: ${kept}件`);

// 空ディレクトリ削除
function pruneEmpty(dir: string): boolean {
  const entries = readdirSync(dir, { withFileTypes: true });
  let empty = true;
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!pruneEmpty(p)) empty = false;
    } else empty = false;
  }
  if (empty && dir !== './public/wp-content/uploads') {
    rmdirSync(dir);
    return true;
  }
  return empty;
}
pruneEmpty('./public/wp-content/uploads');
console.log('空ディレクトリも掃除完了');
