// functions/api/contact.ts — Cloudflare Pages Function（/api/contact）。
//
// /contact のフォーム送信を受け取り、Google Apps Script のウェブアプリ
// （scripts/apps-script/contact.gs）へサーバー側から転送する。
//
// なぜ経由させるのか:
//   1) 旧実装は Google フォームの formResponse へブラウザから直接 POST していたが、
//      フォーム側が送信時に invisible reCAPTCHA を必須化したため常に HTTP 400 になり、
//      さらに mode:'no-cors' で失敗を検知できず「送信できたのに届かない」状態だった。
//   2) 同一オリジンの /api/contact にすることで CORS・プリフライトの問題が消え、
//      本物のステータスコードをページ側に返せる（＝失敗を失敗として表示できる）。
//   3) Apps Script の URL と共有シークレットをブラウザに出さずに済む。
//
// ※ wrangler/esbuild がバンドルする。tsconfig からは除外（astro check / biome の対象外）。

interface Env {
  // Apps Script ウェブアプリの /exec URL（必須）
  CONTACT_ENDPOINT?: string;
  // Apps Script 側のスクリプトプロパティ SHARED_SECRET と同じ値（必須）
  CONTACT_SHARED_SECRET?: string;
}

interface ContactPayload {
  email?: unknown;
  name?: unknown;
  line?: unknown;
  twitter?: unknown;
  age?: unknown;
  gender?: unknown;
  type?: unknown;
  body?: unknown;
  // ボット除け（人間には見えない入力欄。値が入っていたら破棄する）
  nickname?: unknown;
}

// 1リクエストあたりの上限。極端に長い本文で Apps Script 側を詰まらせないための保険。
const MAX_LEN: Record<string, number> = {
  email: 254,
  name: 100,
  line: 100,
  twitter: 100,
  age: 40,
  gender: 20,
  type: 60,
  body: 4000,
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

// 上流（Apps Script）側の失敗を返すときのステータス。
//
// 502 は使ってはいけない: Cloudflare のエッジは 502 を「オリジン障害」と見なして
// 自前のエラーページ（本文 "error code: 502"）に差し替えてしまい、こちらの JSON が
// ページ側に届かなくなる（503 と 4xx は素通りすることを本番で確認済み）。
// ページ側は body の ok で判定しているので、200 + ok:false が最も確実。
const UPSTREAM_FAIL_STATUS = 200;

export const onRequestPost = async (context: {
  request: Request;
  env: Env;
}): Promise<Response> => {
  const { request, env } = context;

  const endpoint = env.CONTACT_ENDPOINT;
  const secret = env.CONTACT_SHARED_SECRET;
  // 未設定のまま本番に出ても「送信できたふり」は絶対にしない。
  // ページ側は 503 を受けて LINE / 公式フォームへの案内を出す。
  if (!endpoint || !secret) {
    return json(
      { ok: false, error: 'フォームの送信先が未設定です。', configured: false },
      503
    );
  }

  let payload: ContactPayload;
  try {
    payload = (await request.json()) as ContactPayload;
  } catch {
    return json({ ok: false, error: 'リクエストの形式が不正です。' }, 400);
  }

  // ハニーポットに入力があるのはボット。受け付けたふりをして静かに捨てる
  // （エラーを返すと学習されるため、あえて ok:true）。
  if (str(payload.nickname)) return json({ ok: true }, 200);

  const fields = {
    email: str(payload.email),
    name: str(payload.name),
    line: str(payload.line),
    twitter: str(payload.twitter),
    age: str(payload.age),
    gender: str(payload.gender),
    type: str(payload.type),
    body: str(payload.body),
  };

  const required: Array<keyof typeof fields> = ['email', 'name', 'age', 'gender', 'type', 'body'];
  if (required.some((k) => !fields[k])) {
    return json({ ok: false, error: '未入力の必須項目があります。' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
    return json({ ok: false, error: 'メールアドレスの形式をご確認ください。' }, 400);
  }
  for (const [k, v] of Object.entries(fields)) {
    if (v.length > (MAX_LEN[k] ?? 1000)) {
      return json({ ok: false, error: '入力が長すぎる項目があります。' }, 400);
    }
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      // Apps Script は text/plain だとプリフライト無しで受けられる。
      // ここはサーバー間通信なので実質どちらでもよいが、素の text/plain で揃える。
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...fields, secret }),
      signal: AbortSignal.timeout(15_000),
    });

    // Apps Script は失敗時も HTTP 200 を返しうるので、本文の ok を必ず確認する。
    const text = await res.text();
    let result: { ok?: boolean; error?: string } = {};
    try {
      result = JSON.parse(text) as typeof result;
    } catch {
      // HTML（ログイン画面など）が返ってきたケース。デプロイ設定ミスの典型。
      return json(
        { ok: false, error: '送信先の応答が不正です。時間をおいてお試しください。' },
        UPSTREAM_FAIL_STATUS
      );
    }

    if (!res.ok || result.ok !== true) {
      return json(
        { ok: false, error: result.error || '送信先でエラーが発生しました。' },
        UPSTREAM_FAIL_STATUS
      );
    }

    return json({ ok: true }, 200);
  } catch (e) {
    return json(
      {
        ok: false,
        error: e instanceof Error && e.name === 'TimeoutError'
          ? '送信がタイムアウトしました。'
          : '送信中にエラーが発生しました。',
      },
      UPSTREAM_FAIL_STATUS
    );
  }
};

// GET は疎通確認のみ（設定済みかどうかだけ返す。秘密は出さない）。
export const onRequestGet = async (context: { env: Env }): Promise<Response> => {
  const configured = Boolean(context.env.CONTACT_ENDPOINT && context.env.CONTACT_SHARED_SECRET);
  return json({ ok: true, configured }, 200);
};
