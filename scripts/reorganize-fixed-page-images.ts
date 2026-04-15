/**
 * 固定ページの画像を WordPress 由来の YYYY/MM 構造から作品別ディレクトリに再配置
 *
 * - public/wp-content/uploads/YYYY/MM/foo.jpg
 *   → public/images/works/{songSlug}/foo.jpg または public/images/discography/foo.jpg
 * - src/data/wp-pages.json の URL も新しいパスに書き換え
 *
 * 同名衝突は接頭辞付きで回避（ほぼ起きないが念のため）
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, statSync } from 'fs';
import { dirname, join, basename } from 'path';

type PageData = { content?: string };
type Data = {
  songs?: ({ slug: string } & PageData)[];
  [key: string]: unknown;
};

const data = JSON.parse(readFileSync('./src/data/wp-pages.json', 'utf-8')) as Data;

// 1. URL → 利用ページ識別子 のマップ
const urlToPage: Record<string, string> = {};
function scan(html: string | undefined, pageId: string) {
  if (!html) return;
  for (const u of html.match(/\/wp-content\/uploads\/[^\s"'<>)]+/g) || []) {
    if (!urlToPage[u]) urlToPage[u] = pageId;
  }
}
for (const s of data.songs || []) scan(s.content, `works/${s.slug}`);
for (const [k, v] of Object.entries(data)) {
  if (k === 'songs' || k === '_v') continue;
  if (Array.isArray(v)) {
    // mitepitwu のような配列構造: 各要素の slug ごとにディレクトリ分け
    v.forEach((item, i) => {
      if (item && typeof item === 'object' && 'content' in item) {
        const subSlug = (item as { slug?: string }).slug || String(i);
        scan((item as PageData).content, `${k}/${subSlug}`);
      }
    });
  } else if (v && typeof v === 'object' && 'content' in v) {
    scan((v as PageData).content, k === 'discography' ? 'discography' : `pages/${k}`);
  }
}

console.log(`再配置対象: ${Object.keys(urlToPage).length}件`);

// 2. 各URLの新パスを決定（同一ディレクトリ内の同名衝突をチェック）
const oldToNew: Record<string, string> = {};
const newPathsUsed = new Set<string>();
let renamed = 0;

for (const [oldUrl, pageId] of Object.entries(urlToPage)) {
  const fileName = basename(oldUrl);
  let newRelPath = `/images/${pageId}/${fileName}`;
  // 衝突回避（ありそうにないが）
  if (newPathsUsed.has(newRelPath)) {
    const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '';
    const stem = ext ? fileName.slice(0, -ext.length) : fileName;
    let i = 2;
    while (newPathsUsed.has(`/images/${pageId}/${stem}-${i}${ext}`)) i++;
    newRelPath = `/images/${pageId}/${stem}-${i}${ext}`;
    renamed++;
  }
  newPathsUsed.add(newRelPath);
  oldToNew[oldUrl] = newRelPath;
}

console.log(`同名衝突 (rename): ${renamed}件`);

// 3. 物理ファイルをコピー（旧→新）
let copied = 0, missing = 0;
for (const [oldUrl, newUrl] of Object.entries(oldToNew)) {
  const oldPath = './public' + oldUrl;
  const newPath = './public' + newUrl;
  if (!existsSync(oldPath)) { missing++; console.log(`  欠損: ${oldUrl}`); continue; }
  mkdirSync(dirname(newPath), { recursive: true });
  copyFileSync(oldPath, newPath);
  copied++;
}
console.log(`コピー完了: ${copied}件 / 欠損: ${missing}件`);

// 4. wp-pages.json の URL 書き換え
function rewrite(html: string): string {
  let out = html;
  for (const [oldUrl, newUrl] of Object.entries(oldToNew)) {
    // URL の長い順にマッチさせるため、ここでは個別 split/join で機械的に置換
    out = out.split(oldUrl).join(newUrl);
  }
  return out;
}

if (data.songs) {
  data.songs = data.songs.map(s => s.content ? { ...s, content: rewrite(s.content) } : s);
}
for (const k of Object.keys(data)) {
  if (k === 'songs' || k === '_v') continue;
  const v = data[k];
  if (Array.isArray(v)) {
    data[k] = v.map(item => {
      if (item && typeof item === 'object' && 'content' in item && typeof (item as PageData).content === 'string') {
        return { ...item, content: rewrite((item as PageData).content!) };
      }
      return item;
    });
  } else if (v && typeof v === 'object' && 'content' in v) {
    const p = v as PageData;
    if (p.content) p.content = rewrite(p.content);
  }
}

writeFileSync('./src/data/wp-pages.json', JSON.stringify(data, null, 2) + '\n', 'utf-8');
console.log('wp-pages.json 書き換え完了');

// 5. 検証: 新JSONに古いパスが残っていないか
const reread = readFileSync('./src/data/wp-pages.json', 'utf-8');
const oldRefs = (reread.match(/\/wp-content\/uploads\//g) || []).length;
console.log(`旧パス残存: ${oldRefs}件`);
