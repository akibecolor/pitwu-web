import { readFileSync, statSync, readdirSync } from 'fs';
import { join } from 'path';

const data = JSON.parse(readFileSync('./src/data/wp-pages.json','utf-8'));

const keep = new Set<string>();
function scan(html: string | undefined) {
  if (!html) return;
  const urls = html.match(/\/wp-content\/uploads\/[^\s"'<>)]+/g) || [];
  urls.forEach(u => keep.add(u));
}
for (const s of data.songs as { content?: string }[]) scan(s.content);
for (const k of Object.keys(data)) {
  if (k === 'songs') continue;
  const item = data[k];
  if (item && typeof item === 'object' && 'content' in item) scan(item.content);
}
console.log(`固定ページが必要とする画像URL: ${keep.size}件`);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}
const allFiles = walk('./public/wp-content/uploads')
  .map(p => p.replace(/\\/g, '/').replace(/^\.\/public/, ''))
  .map(p => p.startsWith('public/') ? '/' + p.slice('public/'.length) : p)
  .map(p => p.startsWith('/wp-content') ? p : ('/' + p.replace(/^.*?wp-content/, 'wp-content')));

console.log(`現在のローカル画像: ${allFiles.length}件`);

const toDelete = allFiles.filter(f => !keep.has(f));
const toKeep = allFiles.filter(f => keep.has(f));

let totalSize = 0, deleteSize = 0, keepSize = 0;
for (const f of allFiles) {
  const s = statSync('./public' + f).size;
  totalSize += s;
  if (keep.has(f)) keepSize += s; else deleteSize += s;
}
const mb = (b: number) => (b / 1024 / 1024).toFixed(1);
console.log(`\n総容量: ${mb(totalSize)}MB`);
console.log(`  削除対象: ${toDelete.length}件 / ${mb(deleteSize)}MB`);
console.log(`  残す:     ${toKeep.length}件 / ${mb(keepSize)}MB`);

const missing = [...keep].filter(u => !allFiles.includes(u));
console.log(`\n固定ページが要求するがローカル欠損: ${missing.length}件`);
missing.slice(0, 5).forEach(u => console.log('  ', u));
