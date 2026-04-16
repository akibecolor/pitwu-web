// microCMS Webhook → GitHub repository_dispatch 中継 Worker
// microCMS はカスタムヘッダーを設定できないため、この Worker が認証を中継する
export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const res = await fetch('https://api.github.com/repos/akibecolor/pitwu-web/dispatches', {
      method: 'POST',
      headers: {
        'Authorization': `token ${env.GITHUB_PAT}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'pitwu-webhook-worker',
      },
      body: JSON.stringify({ event_type: 'microcms_update' }),
    });

    return new Response(res.ok ? 'OK' : `GitHub error: ${res.status}`, { status: res.ok ? 200 : 502 });
  },
};
