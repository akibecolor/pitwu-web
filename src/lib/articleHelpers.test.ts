import { describe, it, expect, vi } from 'vitest';
import { getArticleSlug, getArticlePath } from './articleHelpers.js';
import type { Article } from '../types/index.js';

const article = (over: Partial<Article>): Article =>
  ({ id: 'abc123', title: '記事', slug: 'post', content: '', publishedAt: '2026-04-16T10:32:06.601Z', ...over }) as Article;

describe('getArticleSlug', () => {
  it('URL エンコード済みの slug をデコードする', () => {
    expect(getArticleSlug(article({ slug: '%E7%A5%AD%E3%82%8A' }))).toBe('祭り');
  });

  it('slug が未入力なら記事 ID を使い、警告を出す（"undefined" にしない）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getArticleSlug(article({ slug: undefined as unknown as string }))).toBe('abc123');
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe('getArticlePath', () => {
  it('wpDate を優先して /YYYY/MM/slug を作る', () => {
    expect(getArticlePath(article({ wpDate: '2003-06-01T00:00:00+09:00', slug: 'old' } as Partial<Article>))).toBe('/2003/06/old');
  });

  it('slug 未入力でも /YYYY/MM/undefined にならない', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getArticlePath(article({ slug: '' }))).toBe('/2026/04/abc123');
  });
});
