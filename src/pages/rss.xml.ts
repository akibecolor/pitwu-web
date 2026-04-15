import rss from '@astrojs/rss';
import { getAllArticles } from '../lib/microcms.js';
import { getSourceDate, getArticlePath } from '../lib/articleHelpers.js';

const SITE = 'https://pitwu.com';

export async function GET() {
  const articles = await getAllArticles();
  return rss({
    title: '夢源風人 ブログ',
    description: '大阪・東海を拠点に活動するよさこいチーム「夢源風人」の活動記事',
    site: SITE,
    items: articles.slice(0, 50).map((a) => ({
      title: a.title,
      link: getArticlePath(a),
      pubDate: new Date(getSourceDate(a)),
      categories: a.category ? [a.category.name] : [],
    })),
    customData: '<language>ja-jp</language>',
  });
}
