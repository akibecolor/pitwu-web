/**
 * Google Calendar 操作スクリプト（サービスアカウント認証）
 *
 * 使い方:
 *   npx tsx scripts/gcal.ts list [--cal=event|practice] [--days=30]
 *   npx tsx scripts/gcal.ts add  --cal=event|practice --title="..." --start="YYYY-MM-DD" [--end="YYYY-MM-DD"] [--location="..."] [--desc="..."]
 *   npx tsx scripts/gcal.ts add  --cal=event|practice --title="..." --start="YYYY-MM-DDTHH:MM" [--end="..."] [--location="..."] [--desc="..."]
 *   npx tsx scripts/gcal.ts edit --cal=event|practice --id=EVENT_ID [--title="..."] [--start="..."] [--end="..."] [--location="..."] [--desc="..."]
 *   npx tsx scripts/gcal.ts delete --cal=event|practice --id=EVENT_ID
 *   npx tsx scripts/gcal.ts find  [--cal=event|practice] --query="..."
 *
 * 終日イベント: --start="YYYY-MM-DD"（時刻なし）で自動的に終日として登録
 * 複数日イベント: --start="YYYY-MM-DD" --end="YYYY-MM-DD"（最終日を含む）
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { createSign } from 'crypto';

// ---- 設定 ----
const CALENDARS = {
  event:    '80s4qcc8jd7hisb0k03vkist6g@group.calendar.google.com',
  practice: 'slfifr2ssskd7c6e343jla5i00@group.calendar.google.com',
} as const;
type CalKey = keyof typeof CALENDARS;

const CAL_API = 'https://www.googleapis.com/calendar/v3/calendars';
const TZ = 'Asia/Tokyo';

// ---- .env パース ----
const raw = readFileSync(join(process.cwd(), '.env'), 'utf-8');
const env: Record<string, string> = {};
for (const line of raw.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i === -1) continue;
  const key = t.slice(0, i).trim();
  let val = t.slice(i + 1).trim().replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '');
  env[key] = val;
}

const SERVICE_EMAIL = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY   = env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

// ---- JWT / アクセストークン ----
async function getToken(): Promise<string> {
  const now  = Math.floor(Date.now() / 1000);
  const hdr  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const pay  = Buffer.from(JSON.stringify({
    iss: SERVICE_EMAIL, scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })).toString('base64url');
  const sign = createSign('RSA-SHA256');
  sign.update(`${hdr}.${pay}`);
  const jwt = `${hdr}.${pay}.${sign.sign(PRIVATE_KEY, 'base64url')}`;

  const res  = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = await res.json() as { access_token?: string; error?: string; error_description?: string };
  if (!data.access_token) throw new Error(`認証失敗: ${data.error} - ${data.error_description}`);
  return data.access_token;
}

// ---- 引数パース ----
function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, ...vs] = a.slice(2).split('=');
      args[k] = vs.join('=');
    }
  }
  return args;
}

function calId(key: string): string {
  if (key !== 'event' && key !== 'practice') {
    throw new Error(`--cal は "event"（イベント）か "practice"（練習）を指定してください`);
  }
  return CALENDARS[key as CalKey];
}

/** YYYY-MM-DDTHH:MM → UTC ISO 文字列 */
function toISO(dt: string): string {
  if (dt.includes('+') || dt.endsWith('Z')) return dt;
  return new Date(dt + ':00+09:00').toISOString();
}

/** 先頭10文字（YYYY-MM-DD）を取り出す */
function toDateOnly(dt: string): string {
  return dt.slice(0, 10);
}

/** YYYY-MM-DD の翌日を返す（Google Calendar API の終日終了日は exclusive） */
function nextDay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00+09:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** 時刻なし（YYYY-MM-DD のみ）なら終日イベントとして扱う */
function isAllDay(startArg: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(startArg.trim());
}

/** 表示用日時フォーマット（終日と時刻付きを自動判別） */
function fmtDate(iso?: string): string {
  if (!iso) return '';
  // 日付のみ（YYYY-MM-DD）
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return new Date(iso + 'T12:00:00+09:00').toLocaleString('ja-JP', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    });
  }
  // 日時付き
  return new Date(iso).toLocaleString('ja-JP', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit',
  });
}

// ---- API ヘルパー ----
async function api(token: string, path: string, method = 'GET', body?: object) {
  const res = await fetch(`${CAL_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (method === 'DELETE') {
    if (res.ok || res.status === 204) return null;
    throw new Error(await res.text());
  }
  const data = await res.json() as Record<string, unknown>;
  if ((data as { error?: { message: string } }).error) {
    const e = (data as { error: { message: string } }).error;
    throw new Error(e.message);
  }
  return data;
}

// ========================================
// コマンド実装
// ========================================

async function cmdList(token: string, args: Record<string, string>) {
  const days = parseInt(args.days ?? '30');
  const until = new Date(Date.now() + days * 86400000).toISOString();
  const targets: CalKey[] = args.cal ? [args.cal as CalKey] : ['event', 'practice'];
  const label = { event: 'イベント', practice: '練習' };

  for (const key of targets) {
    const id  = CALENDARS[key];
    const url = `/${encodeURIComponent(id)}/events?timeMin=${new Date().toISOString()}&timeMax=${until}&maxResults=50&singleEvents=true&orderBy=startTime`;
    const res = await api(token, url) as { items?: object[] };
    const items = (res?.items ?? []) as {
      id: string; summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      location?: string;
    }[];

    console.log(`\n📅 【${label[key]}カレンダー】 今後${days}日間 (${items.length}件)`);
    if (items.length === 0) { console.log('  予定なし'); continue; }
    for (const ev of items) {
      const start    = ev.start?.dateTime ?? ev.start?.date ?? '';
      const endRaw   = ev.end?.dateTime ?? ev.end?.date ?? '';
      // 終日イベントの終了日は exclusive なので表示は前日まで
      const endDisp  = ev.end?.date ? fmtDate(toDateOnly(new Date(endRaw + 'T12:00:00+09:00').toISOString().slice(0, 10).replace(/\d{2}$/, d => String(Number(d) - 1).padStart(2, '0')))) : '';
      const endStr   = ev.end?.date
        ? (() => {
            const d = new Date(endRaw + 'T12:00:00+09:00');
            d.setDate(d.getDate() - 1);
            return d.toISOString().slice(0, 10);
          })()
        : ev.end?.dateTime ?? '';

      console.log(`  ID: ${ev.id}`);
      console.log(`  📌 ${ev.summary ?? '（タイトルなし）'}`);
      if (ev.start?.date) {
        // 終日イベント
        const sameDay = endStr === toDateOnly(start);
        console.log(`  📅 ${fmtDate(start)}${sameDay ? '' : ' 〜 ' + fmtDate(endStr)} （終日）`);
      } else {
        console.log(`  🕐 ${fmtDate(start)}${ev.end?.dateTime ? ' 〜 ' + fmtDate(ev.end.dateTime) : ''}`);
      }
      if (ev.location) console.log(`  📍 ${ev.location}`);
      console.log();
    }
  }
}

async function checkDuplicate(token: string, calendarId: string, title: string, startArg: string): Promise<boolean> {
  // 同日を検索（JST基準の0:00〜23:59:59）
  const baseDate = isAllDay(startArg) ? startArg : toDateOnly(new Date(toISO(startArg)).toLocaleString('sv-SE', { timeZone: TZ }));
  const timeMin = new Date(baseDate + 'T00:00:00+09:00').toISOString();
  const timeMax = new Date(baseDate + 'T23:59:59+09:00').toISOString();

  const url = `/${encodeURIComponent(calendarId)}/events?timeMin=${timeMin}&timeMax=${timeMax}&maxResults=50&singleEvents=true`;
  const res = await api(token, url) as { items?: object[] };
  const items = (res?.items ?? []) as { id: string; summary?: string; start?: { dateTime?: string; date?: string } }[];

  const titleNorm = title.trim().toLowerCase();
  const dupes = items.filter(ev => (ev.summary ?? '').trim().toLowerCase() === titleNorm);

  if (dupes.length > 0) {
    console.warn(`⚠️  重複が見つかりました（同日に同じタイトルの予定があります）:`);
    for (const d of dupes) {
      const s = d.start?.dateTime ?? d.start?.date ?? '';
      console.warn(`  ID: ${d.id}`);
      console.warn(`  📌 ${d.summary}`);
      console.warn(`  🕐 ${fmtDate(s)}`);
    }
    return true;
  }
  return false;
}

async function cmdAdd(token: string, args: Record<string, string>) {
  const id        = calId(args.cal ?? '');
  const startArg  = args.start ?? '';
  const allday    = isAllDay(startArg);

  let startField: object, endField: object, startDisp: string, endDisp: string;

  if (allday) {
    const startDate = toDateOnly(startArg);
    const endDate   = args.end ? nextDay(toDateOnly(args.end)) : nextDay(startDate);
    const lastDate  = toDateOnly(new Date(endDate + 'T12:00:00+09:00').toISOString().replace(/T.*/, ''));
    // inclusive last day for display
    const d = new Date(endDate + 'T12:00:00+09:00');
    d.setDate(d.getDate() - 1);
    const lastDateDisp = d.toISOString().slice(0, 10);

    startField = { date: startDate };
    endField   = { date: endDate };
    startDisp  = startDate;
    endDisp    = lastDateDisp === startDate ? '' : lastDateDisp;
  } else {
    const start = toISO(startArg);
    const end   = args.end ? toISO(args.end) : new Date(new Date(start).getTime() + 7200000).toISOString();
    startField  = { dateTime: start, timeZone: TZ };
    endField    = { dateTime: end,   timeZone: TZ };
    startDisp   = start;
    endDisp     = end;
  }

  // 重複チェック
  const isDupe = await checkDuplicate(token, id, args.title ?? '', startArg);
  if (isDupe) {
    if (args.force !== 'true') {
      console.error(`❌ 重複のため登録をスキップしました。強制登録するには --force=true を付けてください。`);
      process.exit(1);
    }
    console.log(`⚠️  重複を無視して登録します (--force=true)`);
  }

  const body = {
    summary:     args.title,
    location:    args.location,
    description: args.desc,
    start: startField,
    end:   endField,
  };

  const res = await api(token, `/${encodeURIComponent(id)}/events`, 'POST', body) as { id: string; summary: string };
  console.log(`✅ 追加しました`);
  console.log(`  ID: ${res.id}`);
  console.log(`  📌 ${res.summary}`);
  if (allday) {
    console.log(`  📅 ${fmtDate(startDisp)}${endDisp ? ' 〜 ' + fmtDate(endDisp) : ''} （終日）`);
  } else {
    console.log(`  🕐 ${fmtDate(startDisp)} 〜 ${fmtDate(endDisp)}`);
  }
  if (args.location) console.log(`  📍 ${args.location}`);
}

async function cmdEdit(token: string, args: Record<string, string>) {
  const id     = calId(args.cal ?? '');
  const evId   = args.id;
  if (!evId) throw new Error('--id が必要です');

  // 既存イベントを取得
  const existing = await api(token, `/${encodeURIComponent(id)}/events/${evId}`) as {
    summary?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    location?: string;
    description?: string;
  };

  const startArg    = args.start ?? existing.start?.date ?? existing.start?.dateTime ?? '';
  const allday      = isAllDay(startArg) || !!existing.start?.date;

  let startField: object, endField: object, startDisp: string, endDisp: string;

  if (allday) {
    const startDate = toDateOnly(startArg);
    let endDate: string;
    if (args.end) {
      endDate = nextDay(toDateOnly(args.end));
    } else if (existing.end?.date) {
      endDate = existing.end.date; // already exclusive
    } else {
      // existing was timed → convert end to all-day
      const existEndDate = toDateOnly(new Date(existing.end?.dateTime ?? '').toLocaleString('sv-SE', { timeZone: TZ }));
      endDate = nextDay(existEndDate);
    }
    const d = new Date(endDate + 'T12:00:00+09:00');
    d.setDate(d.getDate() - 1);
    const lastDateDisp = d.toISOString().slice(0, 10);

    startField = { date: startDate };
    endField   = { date: endDate };
    startDisp  = startDate;
    endDisp    = lastDateDisp === startDate ? '' : lastDateDisp;
  } else {
    const start = args.start ? toISO(args.start) : (existing.start?.dateTime ?? '');
    const end   = args.end   ? toISO(args.end)   : (existing.end?.dateTime   ?? '');
    startField  = { dateTime: start, timeZone: TZ };
    endField    = { dateTime: end,   timeZone: TZ };
    startDisp   = start;
    endDisp     = end;
  }

  const body = {
    summary:     args.title    ?? existing.summary,
    location:    args.location ?? existing.location,
    description: args.desc     ?? existing.description,
    start: startField,
    end:   endField,
  };

  const res = await api(token, `/${encodeURIComponent(id)}/events/${evId}`, 'PUT', body) as { summary: string };
  console.log(`✅ 更新しました`);
  console.log(`  📌 ${res.summary}`);
  if (allday) {
    console.log(`  📅 ${fmtDate(startDisp)}${endDisp ? ' 〜 ' + fmtDate(endDisp) : ''} （終日）`);
  } else {
    console.log(`  🕐 ${fmtDate(startDisp)} 〜 ${fmtDate(endDisp)}`);
  }
  if (body.location) console.log(`  📍 ${body.location}`);
}

async function cmdDelete(token: string, args: Record<string, string>) {
  const id   = calId(args.cal ?? '');
  const evId = args.id;
  if (!evId) throw new Error('--id が必要です');
  await api(token, `/${encodeURIComponent(id)}/events/${evId}`, 'DELETE');
  console.log(`🗑️  削除しました (ID: ${evId})`);
}

async function cmdFind(token: string, args: Record<string, string>) {
  const query   = args.query ?? '';
  const targets: CalKey[] = args.cal ? [args.cal as CalKey] : ['event', 'practice'];
  const label = { event: 'イベント', practice: '練習' };

  for (const key of targets) {
    const id  = CALENDARS[key];
    const url = `/${encodeURIComponent(id)}/events?q=${encodeURIComponent(query)}&maxResults=10&singleEvents=true&orderBy=startTime`;
    const res = await api(token, url) as { items?: object[] };
    const items = (res?.items ?? []) as {
      id: string; summary?: string;
      start?: { dateTime?: string; date?: string };
      location?: string;
    }[];

    console.log(`\n🔍 【${label[key]}】"${query}" の検索結果 (${items.length}件)`);
    for (const ev of items) {
      const start = ev.start?.dateTime ?? ev.start?.date ?? '';
      const allday = !!ev.start?.date;
      console.log(`  ID: ${ev.id}`);
      console.log(`  📌 ${ev.summary}`);
      console.log(`  ${allday ? '📅' : '🕐'} ${fmtDate(start)}${allday ? ' （終日）' : ''}`);
      if (ev.location) console.log(`  📍 ${ev.location}`);
      console.log();
    }
  }
}

// ========================================
// エントリーポイント
// ========================================
const [,, cmd, ...rest] = process.argv;
const args = parseArgs(rest);

if (!cmd || cmd === 'help') {
  console.log(`
使い方:
  list   [--cal=event|practice] [--days=30]
  add    --cal=event|practice --title="..." --start="YYYY-MM-DD" [--end="YYYY-MM-DD（最終日）"] [--location="..."] [--desc="..."]
  add    --cal=event|practice --title="..." --start="YYYY-MM-DDTHH:MM" [--end="YYYY-MM-DDTHH:MM"] [--location="..."] [--desc="..."] [--force=true]
  edit   --cal=event|practice --id=EVENT_ID [--title="..."] [--start="..."] [--end="..."] [--location="..."] [--desc="..."]
  delete --cal=event|practice --id=EVENT_ID
  find   [--cal=event|practice] --query="..."

終日イベント: --start="YYYY-MM-DD"（時刻なし）で自動的に終日として登録
複数日:       --end="YYYY-MM-DD" で最終日（含む）を指定
`);
  process.exit(0);
}

const token = await getToken();

switch (cmd) {
  case 'list':   await cmdList(token, args);   break;
  case 'add':    await cmdAdd(token, args);    break;
  case 'edit':   await cmdEdit(token, args);   break;
  case 'delete': await cmdDelete(token, args); break;
  case 'find':   await cmdFind(token, args);   break;
  default: console.error(`不明なコマンド: ${cmd}`); process.exit(1);
}
