// microCMS 下書きプレビュー Worker
// URL: /preview?id={CONTENT_ID}&key={DRAFT_KEY}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const draftKey = url.searchParams.get('key');

    if (!id || !draftKey) {
      return new Response('Usage: ?id={CONTENT_ID}&key={DRAFT_KEY}', { status: 400 });
    }

    // microCMS から下書き記事を取得
    const apiUrl = `https://${env.MICROCMS_SERVICE_DOMAIN}.microcms.io/api/v1/articles/${id}?draftKey=${draftKey}`;
    const res = await fetch(apiUrl, {
      headers: { 'X-MICROCMS-API-KEY': env.MICROCMS_API_KEY },
    });

    if (!res.ok) {
      return new Response(`microCMS error: ${res.status}`, { status: res.status });
    }

    const article = await res.json();

    // 日付フォーマット
    const date = new Date(article.wpDate || article.publishedAt || article.createdAt);
    const displayDate = date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

    // eyecatch
    const eyecatchHtml = article.eyecatch?.url
      ? `<div class="eyecatch"><img src="${article.eyecatch.url}" alt="${article.title}"></div>`
      : '';

    // category
    const categoryHtml = article.category?.name
      ? `<span class="category">${article.category.name}</span>`
      : '';

    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>[PREVIEW] ${article.title} | 夢源風人</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=Noto+Serif+JP:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root { --deep: #1B3F8B; --sky: #6EC6F0; --ink: #1A1F2E; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Noto Serif JP', serif; color: var(--ink); background: #f8faff; }
    .banner { background: #e74c3c; color: #fff; text-align: center; padding: 0.5rem; font-size: 0.8rem; font-weight: 600; position: sticky; top: 0; z-index: 100; letter-spacing: 0.1em; }
    .container { max-width: 720px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
    .eyecatch img { width: 100%; height: auto; border-radius: 8px; margin-bottom: 2rem; }
    .category { display: inline-block; font-size: 0.75rem; background: var(--deep); color: #fff; padding: 0.25rem 0.65rem; border-radius: 2px; margin-bottom: 1rem; }
    h1 { font-size: clamp(1.4rem, 4vw, 1.8rem); font-weight: 700; color: var(--deep); line-height: 1.4; margin-bottom: 0.5rem; }
    .date { font-size: 0.8rem; color: rgba(26,31,46,0.5); margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(110,198,240,0.3); }
    .body { font-size: 1rem; line-height: 1.9; }
    .body h2 { font-size: 1.4rem; color: var(--deep); margin: 2rem 0 0.75rem; padding-bottom: 0.4rem; border-bottom: 2px solid var(--sky); }
    .body h3 { font-size: 1.15rem; color: var(--deep); margin: 1.5rem 0 0.5rem; padding-left: 0.7rem; border-left: 3px solid #D4A84B; }
    .body p { margin-bottom: 1.2rem; }
    .body img, .body figure img { max-width: 100%; height: auto; border-radius: 6px; margin: 1rem 0; }
    .body a { color: var(--sky); }
    .body ul, .body ol { margin: 1rem 0 1.5rem 1.5rem; }
    .body li { margin-bottom: 0.3rem; }
    .body blockquote { border-left: 4px solid var(--sky); margin: 1rem 0; padding: 0.8rem 1.2rem; background: rgba(110,198,240,0.06); font-style: italic; }
    .body code { font-size: 0.875em; background: rgba(110,198,240,0.12); padding: 0.1em 0.4em; border-radius: 3px; }
    .body figure { margin: 1rem 0; }
  </style>
</head>
<body>
  <div class="banner">PREVIEW — この記事は下書きです。公開されていません。</div>
  <div class="container">
    ${eyecatchHtml}
    ${categoryHtml}
    <h1>${article.title}</h1>
    <p class="date">${displayDate}</p>
    <div class="body">${article.content}</div>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
};
