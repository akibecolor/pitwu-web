/**
 * 記事内の URL生リンクを記事タイトルに置換
 *  - <a href="...">https://pitwu.com/2005/10/.../</a> や同URL系
 *  - href のみ相対化済の <a href="/2005/10/.../">https://pitwu.com/...</a>
 * リンクテキストが URL（pitwu.com 自記事）の場合、リンク先記事のタイトルに差し替える
 */

import { requireMicroCmsEnv } from './lib/env.js';
import { delay, tsLog as log } from './lib/util.js';

const { domain: D, apiKey: K } = requireMicroCmsEnv();

async function fetchAll<T>(fields: string): Promise<T[]> {
  const all: T[] = [];
  let off = 0;
  while (true) {
    const r = await fetch(`https://${D}.microcms.io/api/v1/articles?limit=100&offset=${off}&fields=${fields}`, {
      headers: { 'X-MICROCMS-API-KEY': K },
    });
    const d = await r.json() as { contents: T[]; totalCount: number };
    all.push(...d.contents);
    if (all.length >= d.totalCount) break;
    off += 100;
  }
  return all;
}

type Meta = { id: string; title: string; slug: string; content?: string };
const articles = await fetchAll<Meta>('id,title,slug,content');
log(`記事 ${articles.length}件を取得`);

// slug → title マッピング
const slugToTitle: Record<string, string> = {};
for (const a of articles) {
  slugToTitle[a.slug] = a.title;
  // デコード版でも引けるようにする
  const dec = decodeURIComponent(a.slug);
  if (dec !== a.slug) slugToTitle[dec] = a.title;
}
log(`slug→title マッピング: ${Object.keys(slugToTitle).length}件`);

// HTML エンティティデコード
function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&#038;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}

// URL を含むテキストか判定
function looksLikeUrl(text: string): boolean {
  const t = text.trim();
  return /^(?:https?:)?\/\/[^\s]+\/?$/.test(t) || /^\/(?:\d{4}|category|tag)\/[^\s]+\/?$/.test(t);
}

// URL からスラッグを抽出 (/2005/10/slug/ 形式)
function extractSlug(url: string): string | null {
  const m = url.match(/\/(?:\d{4})\/(?:\d{2})\/([^/?#]+)\/?/);
  return m ? decodeURIComponent(m[1]) : null;
}

// content 内の <a> タグを処理
function beautify(content: string): { content: string; changed: number } {
  let changed = 0;
  // <a ...href="..."...>text</a> をマッチ。textはタグなしのシンプル文字列のみ対象。
  const out = content.replace(/<a\b([^>]*?)>([^<]+)<\/a>/g, (whole, attrs, text) => {
    const hrefMatch = attrs.match(/\bhref="([^"]+)"/);
    if (!hrefMatch) return whole;
    const href = hrefMatch[1];

    // 1) href が pitwu.com の絶対URLなら相対化
    let newHref = href;
    const abs = href.match(/^(?:https?:)?\/\/pitwu\.com(\/.*)$/);
    if (abs) newHref = abs[1];

    const decodedText = decodeEntities(text).trim();
    const isUrlText = looksLikeUrl(decodedText);

    let newText = text;
    if (isUrlText) {
      // テキスト側にあるURLからslugを抜く
      const slug = extractSlug(decodedText);
      if (slug && slugToTitle[slug]) {
        newText = slugToTitle[slug];
      } else {
        // hrefから取れる場合はそちらを使う
        const slug2 = extractSlug(newHref);
        if (slug2 && slugToTitle[slug2]) newText = slugToTitle[slug2];
      }
    }

    if (newHref === href && newText === text) return whole;
    changed++;
    const newAttrs = attrs.replace(/\bhref="[^"]+"/, `href="${newHref}"`);
    return `<a${newAttrs}>${newText}</a>`;
  });
  return { content: out, changed };
}

let okCnt = 0, skipCnt = 0, errCnt = 0, totalChanged = 0;
for (let i = 0; i < articles.length; i++) {
  const a = articles[i];
  if (!a.content) { skipCnt++; continue; }
  const { content, changed } = beautify(a.content);
  if (changed === 0) { skipCnt++; continue; }
  totalChanged += changed;

  const r = await fetch(`https://${D}.microcms.io/api/v1/articles/${a.id}`, {
    method: 'PATCH',
    headers: { 'X-MICROCMS-API-KEY': K, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (r.ok) {
    okCnt++;
    if (okCnt % 25 === 0) log(`  ${okCnt} 件 PATCH 完了`);
  } else if (r.status === 429) {
    log('  レートリミット 10秒待機');
    await delay(10000); i--; continue;
  } else {
    errCnt++;
    log(`  ✗ ${a.id}: ${r.status}`);
  }
  await delay(400);
}

log(`\n=== 完了 ===`);
log(`PATCH成功: ${okCnt} / スキップ: ${skipCnt} / エラー: ${errCnt}`);
log(`書き換えリンク総数: ${totalChanged}`);
