// functions/api/calendar.ts — Cloudflare Pages Function（ファイルベースルーティングで /api/calendar）。
//
// サイト本体は完全静的(SSG)。カレンダーはほぼ即時反映が要るため、この関数だけがランタイムで
// Google Calendar API v3 をサーバー側から叩く（APIキーはブラウザに出さない）。
// 公開カレンダーなので read-only API キーのみで取得可能（OAuth/サービスアカウント不要）。
//
// 正規化ロジックは src/lib/calendar.ts に集約（ユニットテスト済み）。ここは取得＋整形の薄いラッパ。
// ※ wrangler/esbuild がバンドルする。tsconfig からは除外（astro check / biome の対象外）。
import { normalizeEvents, type CalendarKind, type RawGCalEvent } from '../../src/lib/calendar';

interface Env {
  GOOGLE_CALENDAR_API_KEY?: string;
  // 参照するカレンダーIDの上書き（任意）。未設定なら既定値を使う。
  // 既定は gcal-agent 管理の「祭り・イベント参加<公開>」(80s4qcc8) / 練習(slfifr2s)。
  // 将来 pitwu-app 公開先に寄せる場合は環境変数で差し替える（例: EVENT_CALENDAR_ID=c_8c348...）。コード変更不要。
  EVENT_CALENDAR_ID?: string;
  PRACTICE_CALENDAR_ID?: string;
}

// ID は公知情報（秘密でない）。環境変数が無いときの既定値。
const DEFAULT_EVENT_ID = '80s4qcc8jd7hisb0k03vkist6g@group.calendar.google.com';
const DEFAULT_PRACTICE_ID = 'slfifr2ssskd7c6e343jla5i00@group.calendar.google.com';

// 種別はカレンダー単位で判別（タイトル推定はしない）。
function resolveCalendars(env: Env): ReadonlyArray<{ id: string; kind: CalendarKind }> {
  return [
    { id: env.EVENT_CALENDAR_ID ?? DEFAULT_EVENT_ID, kind: '祭り・イベント' },
    { id: env.PRACTICE_CALENDAR_ID ?? DEFAULT_PRACTICE_ID, kind: '練習' },
  ];
}

function json(body: unknown, maxAge = 0): Response {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
  };
  if (maxAge > 0) headers['cache-control'] = `public, max-age=${maxAge}`;
  return new Response(JSON.stringify(body), { status: 200, headers });
}

export const onRequestGet = async (context: { env: Env }): Promise<Response> => {
  const apiKey = context.env.GOOGLE_CALENDAR_API_KEY;
  // キー未設定でも 500 で真っ白にせず、ページ側がフォールバック表示できるよう 200 + error。
  if (!apiKey) return json({ error: 'API key not configured', events: [] });

  // 直近の実績も少し見せるため timeMin は約1ヶ月前から。
  const since = new Date();
  since.setMonth(since.getMonth() - 1);
  const timeMin = since.toISOString();

  try {
    const collected: Array<{ raw: RawGCalEvent; kind: CalendarKind }> = [];
    for (const cal of resolveCalendars(context.env)) {
      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events`
      );
      url.searchParams.set('key', apiKey);
      url.searchParams.set('singleEvents', 'true'); // 繰り返しを1回ずつに展開
      url.searchParams.set('orderBy', 'startTime');
      url.searchParams.set('timeZone', 'Asia/Tokyo');
      url.searchParams.set('maxResults', '250');
      url.searchParams.set('timeMin', timeMin);

      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`calendar ${cal.kind} fetch failed: ${res.status}`);
      const data = (await res.json()) as { items?: RawGCalEvent[] };
      for (const raw of data.items ?? []) collected.push({ raw, kind: cal.kind });
    }
    return json({ events: normalizeEvents(collected) }, 300); // 5分キャッシュ
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e), events: [] });
  }
};
