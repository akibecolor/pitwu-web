import { describe, it, expect } from 'vitest';
import {
  expandVideoEmbeds,
  expandTweetEmbeds,
  hasTweetEmbed,
  wrapLyricsSection,
  buildArticleMetaDescription,
} from './htmlTransform.js';

describe('expandVideoEmbeds', () => {
  it('mp4 リンクだけの <p> を <video> figure に展開する', () => {
    const out = expandVideoEmbeds('<p><a href="https://example.com/v.mp4">動画</a></p>');
    expect(out).toContain('<figure class="video-embed">');
    expect(out).toContain('<video controls preload="metadata" playsinline src="https://example.com/v.mp4">');
    expect(out).not.toContain('<p>');
  });

  it('webm も対象になる', () => {
    const out = expandVideoEmbeds('<p><a href="/media/clip.webm">clip</a></p>');
    expect(out).toContain('src="/media/clip.webm"');
  });

  it('動画でないリンクはそのまま残す', () => {
    const html = '<p><a href="https://example.com/page.html">ページ</a></p>';
    expect(expandVideoEmbeds(html)).toBe(html);
  });
});

describe('expandTweetEmbeds / hasTweetEmbed', () => {
  it('x.com の status リンクを twitter.com 正規化した blockquote に展開する', () => {
    const out = expandTweetEmbeds('<p><a href="https://x.com/foo/status/123">見て</a></p>');
    expect(out).toContain('class="twitter-tweet"');
    expect(out).toContain('href="https://twitter.com/foo/status/123"');
    expect(out).toContain('見て');
    expect(hasTweetEmbed(out)).toBe(true);
  });

  it('リンクテキストが空なら @ハンドルの投稿 を補う', () => {
    const out = expandTweetEmbeds('<p><a href="https://twitter.com/bar/status/456"></a></p>');
    expect(out).toContain('@barの投稿');
  });

  it('クエリ付き URL でも id を取り出して正規化する', () => {
    const out = expandTweetEmbeds('<p><a href="https://x.com/baz/status/789?s=20">x</a></p>');
    expect(out).toContain('href="https://twitter.com/baz/status/789"');
  });

  it('ツイート埋め込みが無ければ hasTweetEmbed は false', () => {
    expect(hasTweetEmbed('<p>ただの本文</p>')).toBe(false);
  });
});

describe('wrapLyricsSection', () => {
  it('<h3>歌詞</h3> 以降を .wp-lyrics でラップする', () => {
    const out = wrapLyricsSection('<h3>歌詞</h3><p>la la</p>');
    expect(out).toBe('<div class="wp-lyrics"><h3>歌詞</h3><p>la la</p></div>');
  });

  it('次の <h3> の手前までで止める', () => {
    const out = wrapLyricsSection('<h3>歌詞</h3><p>a</p><h3>次</h3><p>b</p>');
    expect(out).toContain('<div class="wp-lyrics"><h3>歌詞</h3><p>a</p></div>');
    expect(out).toContain('<h3>次</h3><p>b</p>');
    // 次セクションはラップ外
    expect(out).not.toContain('<p>b</p></div>');
  });

  it('歌詞見出しが無ければ変更しない', () => {
    const html = '<h3>クレジット</h3><p>x</p>';
    expect(wrapLyricsSection(html)).toBe(html);
  });
});

describe('buildArticleMetaDescription', () => {
  it('固定リードに本文抜粋を続ける', () => {
    const out = buildArticleMetaDescription('テスト', '<p>本文テキスト</p>');
    expect(out).toBe('夢源風人の活動記事「テスト」。本文テキスト');
  });

  it('HTML タグを除去し空白を畳む', () => {
    const out = buildArticleMetaDescription('A', '<p>あ</p>\n  <p>い   う</p>');
    expect(out).toBe('夢源風人の活動記事「A」。あ い う');
  });

  it('最大長を超える本文は … で省略する', () => {
    const body = 'あ'.repeat(300);
    const out = buildArticleMetaDescription('T', `<p>${body}</p>`, 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith('…')).toBe(true);
    expect(out.startsWith('夢源風人の活動記事「T」。')).toBe(true);
  });

  it('リード自体が最大長を超える場合はリードを省略して返す', () => {
    const out = buildArticleMetaDescription('長いタイトル'.repeat(10), '<p>本文</p>', 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith('…')).toBe(true);
  });

  it('本文が空ならリードだけを返す', () => {
    const out = buildArticleMetaDescription('題', '   ');
    expect(out).toBe('夢源風人の活動記事「題」。');
  });
});
