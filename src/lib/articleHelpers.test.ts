import { describe, it, expect } from 'vitest';
import { getArticleSlug, getArticlePath } from './articleHelpers.js';
import type { Article } from '../types/index.js';

const article = (over: Partial<Article>): Article =>
  ({ id: 'abc123', title: '記事', slug: 'post', content: '', publishedAt: '2026-04-16T10:32:06.601Z', ...over }) as Article;

describe('getArticleSlug', () => {
  it('URL エンコード済みの slug をデコードする', () => {
    expect(getArticleSlug(article({ slug: '%E7%A5%AD%E3%82%8A' }))).toBe('祭り');
  });

  it('slug が未入力なら記事 ID を使う（"undefined" にしない）', () => {
    expect(getArticleSlug(article({ slug: undefined as unknown as string }))).toBe('abc123');
    expect(getArticleSlug(article({ slug: '' }))).toBe('abc123');
  });
});

describe('getArticlePath', () => {
  it('wpDate を優先して /YYYY/MM/slug を作る', () => {
    // 月の境目はタイムゾーンで変わる（CI は UTC）ので月の半ばの日時を使う
    expect(getArticlePath(article({ wpDate: '2003-06-15T12:00:00+09:00', slug: 'old' } as Partial<Article>))).toBe('/2003/06/old');
  });

  it('slug 未入力なら /YYYY/MM/<記事ID> になる', () => {
    expect(getArticlePath(article({ slug: '' }))).toBe('/2026/04/abc123');
  });
});
