/**
 * inject-search-hints.ts — Pagefind 検索インデックス補強（ビルド後処理）
 *
 * 目的:
 *   - 記事本文を kuromoji で形態素解析し、固有名詞のカタカナ読みを抽出
 *   - src/data/search-aliases.json の手動揺れ辞書（よみ ↔ 漢字表記）を適用
 *   - 各記事 HTML の data-pagefind-body 要素末尾に、補強テキスト入り hidden div を注入
 *   - Pagefind が同 hidden div を記事本文の一部として索引するため、
 *     読み仮名で検索したときに漢字表記の記事がヒットするようになる
 *
 * 対象ページ:
 *   - dist/[YYYY]/[MM]/[slug]/index.html（記事ページのみ）
 *   - それ以外（トップ / discography / 固定ページ / タグ・カテゴリ）は対象外
 *
 * 実行:
 *   npx tsx scripts/inject-search-hints.ts
 *   （通常は npm run build の astro build と pagefind --site dist の間で実行される）
 *
 * 冪等性:
 *   注入される hidden div には data-search-hints="1" マーカーを付ける。
 *   再実行時は既存マーカー付き div を除去してから新たに挿入する。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - kuromoji は型定義なし
import kuromoji from 'kuromoji';

import { scanFiles, tsLog as log } from './lib/util.js';

// -----------------------------------------------------------------------------
// 定数
// -----------------------------------------------------------------------------

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const DIST_DIR = join(ROOT, 'dist');
const ALIASES_PATH = join(ROOT, 'src', 'data', 'search-aliases.json');
const KUROMOJI_DICT_PATH = join(ROOT, 'node_modules', 'kuromoji', 'dict');

/** 記事ページのパス判定。 dist 起点の相対パス（区切りは '/' に正規化）。 */
const ARTICLE_PATH_RE = /^\d{4}\/\d{2}\/[^/]+\/index\.html$/;

/** 注入する hidden div のマーカー属性。冪等性担保。 */
const HINT_MARKER_ATTR = 'data-search-hints="1"';

/** オフスクリーン配置スタイル。display:none だと Pagefind がインデックスしない。 */
const HINT_STYLE =
  'position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;';

// -----------------------------------------------------------------------------
// 型
// -----------------------------------------------------------------------------

interface AliasesFile {
  _comment?: string;
  aliases: Record<string, string[]>;
}

interface KuromojiToken {
  surface_form: string;
  pos: string;
  pos_detail_1: string;
  pos_detail_2: string;
  pos_detail_3: string;
  reading?: string;
  basic_form?: string;
}

interface Tokenizer {
  tokenize(text: string): KuromojiToken[];
}

// -----------------------------------------------------------------------------
// ユーティリティ
// -----------------------------------------------------------------------------

/** kuromoji tokenizer を初期化。失敗したらビルド停止。 */
function buildTokenizer(): Promise<Tokenizer> {
  return new Promise((resolve, reject) => {
    kuromoji
      .builder({ dicPath: KUROMOJI_DICT_PATH })
      .build((err: Error | null, tokenizer: Tokenizer) => {
        if (err) reject(err);
        else resolve(tokenizer);
      });
  });
}

/** 相対パスを常に '/' 区切りに正規化する（Windows 対策）。 */
function toPosix(path: string): string {
  return sep === '/' ? path : path.split(sep).join('/');
}

/**
 * HTML から data-pagefind-body 属性を持つ最初の要素を検出し、
 * - 本文テキスト（タグ除去後）
 * - 要素の閉じタグ位置（末尾に hint を挿入する位置）
 * を返す。見つからなければ null。
 *
 * HTML パーサは使わず、正規表現ベースで Astro 出力の単純な構造を扱う。
 * （既存の `scripts/htmlTransform` も同方針）
 */
function findPagefindBody(
  html: string,
): { tagStart: number; contentStart: number; contentEnd: number; tagEnd: number } | null {
  // `<div ... data-pagefind-body ...>` を検出（属性順不同に対応）
  const openRe = /<div\b[^>]*\bdata-pagefind-body\b[^>]*>/i;
  const m = openRe.exec(html);
  if (!m) return null;

  const tagStart = m.index;
  const contentStart = tagStart + m[0].length;

  // 対応する </div> を探す（ネストした <div> を数える）
  let depth = 1;
  const re = /<\/?div\b[^>]*>/gi;
  re.lastIndex = contentStart;
  let lastMatch: RegExpExecArray | null;
  while ((lastMatch = re.exec(html)) !== null) {
    if (lastMatch[0].startsWith('</')) {
      depth--;
      if (depth === 0) {
        return {
          tagStart,
          contentStart,
          contentEnd: lastMatch.index,
          tagEnd: lastMatch.index + lastMatch[0].length,
        };
      }
    } else {
      depth++;
    }
  }
  // 対応閉じタグ無し
  return null;
}

/**
 * HTML 断片からテキストだけを取り出す。
 * - <script> <style> <template> の中身は除外
 * - それ以外のタグは除去し、HTML エンティティを最低限デコード
 * （あくまで形態素解析・辞書マッチ用の近似テキスト）
 */
function stripHtmlToText(html: string): string {
  let s = html;
  // script / style / template の中身は除去
  s = s.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  // タグ除去
  s = s.replace(/<[^>]+>/g, ' ');
  // 主要エンティティだけデコード
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // 空白まとめ
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** 文字列が全てカタカナまたはひらがな（＋長音）かどうか。 */
function isKanaOnly(s: string): boolean {
  return /^[\u3040-\u309F\u30A0-\u30FF\u30FCー]+$/.test(s);
}

/**
 * 形態素解析から固有名詞のカタカナ読みを抽出。
 *
 * 採用条件:
 *   - 品詞: 名詞-固有名詞-*（人名・地名・組織名）
 *   - reading が存在し '*' ではない
 *   - reading が2文字以上
 *   - surface_form が既に全てひらがな/カタカナなら冗長なのでスキップ
 */
function extractProperNounReadings(
  text: string,
  tokenizer: Tokenizer,
): Set<string> {
  const readings = new Set<string>();
  if (!text) return readings;
  let tokens: KuromojiToken[];
  try {
    tokens = tokenizer.tokenize(text);
  } catch (e) {
    log(`  kuromoji tokenize 失敗: ${(e as Error).message}`);
    return readings;
  }
  for (const t of tokens) {
    if (t.pos !== '名詞') continue;
    if (t.pos_detail_1 !== '固有名詞') continue;
    const reading = t.reading;
    if (!reading || reading === '*') continue;
    if (reading.length < 2) continue;
    if (isKanaOnly(t.surface_form)) continue;
    readings.add(reading);
  }
  return readings;
}

/**
 * 辞書エイリアスを適用。
 * 本文テキストに漢字表記（values の要素）のいずれかが含まれれば、対応する「よみ」（key）を返す。
 */
function applyAliases(text: string, aliases: Record<string, string[]>): Set<string> {
  const hits = new Set<string>();
  for (const [yomi, surfaces] of Object.entries(aliases)) {
    for (const sf of surfaces) {
      if (sf && text.includes(sf)) {
        hits.add(yomi);
        break;
      }
    }
  }
  return hits;
}

/** HTML エスケープ（注入するテキスト用）。 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 既存の hint div を除去（冪等性のため）。 */
function removeExistingHints(html: string): string {
  // data-search-hints="1" を含む <div>…</div> を除去（ネスト無し前提）
  const re = /<div\b[^>]*\bdata-search-hints="1"[^>]*>[\s\S]*?<\/div>/gi;
  return html.replace(re, '');
}

/** 新しい hint div の HTML 文字列を作る。 */
function buildHintDiv(tokens: string[]): string {
  const joined = tokens.join(' ');
  return (
    `<div data-pagefind-body ${HINT_MARKER_ATTR} aria-hidden="true" ` +
    `style="${HINT_STYLE}">${escapeHtml(joined)}</div>`
  );
}

// -----------------------------------------------------------------------------
// メイン
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!existsSync(DIST_DIR)) {
    log(`dist ディレクトリが存在しない: ${DIST_DIR}`);
    log('astro build を先に実行してください。');
    process.exit(1);
  }

  // 辞書読み込み
  let aliases: Record<string, string[]> = {};
  if (existsSync(ALIASES_PATH)) {
    try {
      const raw = readFileSync(ALIASES_PATH, 'utf8');
      const parsed = JSON.parse(raw) as AliasesFile;
      aliases = parsed.aliases ?? {};
      log(`揺れ辞書を読み込み: ${Object.keys(aliases).length} 件のよみエントリ`);
    } catch (e) {
      log(`揺れ辞書の読み込みに失敗: ${(e as Error).message}`);
      process.exit(1);
    }
  } else {
    log(`揺れ辞書が無い（${ALIASES_PATH}）。処理続行するが B2 は効きません。`);
  }

  // kuromoji 初期化
  log('kuromoji 初期化中…');
  const t0 = Date.now();
  const tokenizer = await buildTokenizer();
  log(`kuromoji 初期化完了（${Date.now() - t0} ms）`);

  // dist 配下の HTML を列挙して記事ページに絞る
  const allFiles = scanFiles(DIST_DIR).filter((p) => p.endsWith('.html'));
  const articles = allFiles.filter((absPath) => {
    const rel = toPosix(relative(DIST_DIR, absPath));
    return ARTICLE_PATH_RE.test(rel);
  });
  log(`記事ページ候補: ${articles.length} 件 / 全 HTML: ${allFiles.length} 件`);

  let processed = 0;
  let injected = 0;
  let skippedNoBody = 0;
  let failed = 0;

  for (const absPath of articles) {
    processed++;
    try {
      let html = readFileSync(absPath, 'utf8');

      // 既存 hint を除去（冪等）
      html = removeExistingHints(html);

      const body = findPagefindBody(html);
      if (!body) {
        skippedNoBody++;
        continue;
      }

      const bodyHtml = html.slice(body.contentStart, body.contentEnd);
      const text = stripHtmlToText(bodyHtml);

      // 読みを集約
      const tokens = new Set<string>();
      for (const r of extractProperNounReadings(text, tokenizer)) tokens.add(r);
      for (const r of applyAliases(text, aliases)) tokens.add(r);

      if (tokens.size === 0) {
        // 何も追加しない（ファイル書き戻しは既存 hint 除去のみ反映）
        writeFileSync(absPath, html, 'utf8');
        continue;
      }

      const hintDiv = buildHintDiv([...tokens]);
      const newHtml =
        html.slice(0, body.contentEnd) + hintDiv + html.slice(body.contentEnd);
      writeFileSync(absPath, newHtml, 'utf8');
      injected++;
    } catch (e) {
      failed++;
      log(`  失敗: ${absPath} — ${(e as Error).message}`);
    }
  }

  log(
    `完了 — 処理=${processed} 注入=${injected} 本文未検出=${skippedNoBody} 失敗=${failed}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
