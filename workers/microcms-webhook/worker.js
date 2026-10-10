// microCMS Webhook → GitHub repository_dispatch 中継 Worker
// microCMS はカスタムヘッダーを設定できないため、この Worker が認証を中継する
//
// 送り元の確認: microCMS の Webhook 設定で「シークレット値」を入れると、リクエストボディを
// その値で HMAC-SHA256 した16進文字列が X-MICROCMS-Signature ヘッダーに付く。
// Worker の secret MICROCMS_WEBHOOK_SECRET に同じ値を入れ、一致しないリクエストは捨てる
// （URL を知っているだけの第三者が本番の再ビルドを起動できないようにする）。
export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // secret 未設定のまま素通しにはしない（設定漏れで無防備に戻るのを防ぐ）
    if (!env.MICROCMS_WEBHOOK_SECRET) {
      return new Response('Webhook secret not configured', { status: 500 });
    }

    const body = await request.text();
    const signature = request.headers.get('X-MICROCMS-Signature') ?? '';
    if (!(await verify(body, signature, env.MICROCMS_WEBHOOK_SECRET))) {
      return new Response('Unauthorized', { status: 401 });
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

async function verify(body, signature, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  // 長さ・内容とも一致を定数時間で比較する
  if (signature.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
