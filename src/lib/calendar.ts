/**
 * 公開 Google カレンダー（祭り・イベント / 練習）の予定を表示用に整形するピュア関数群。
 *
 * Google Calendar API v3 の Events リソースを入力に、終日イベントの排他終了日補正・
 * 日程未定（？始まり）/ キャンセル除外・種別付与・並び替えを行う。
 * DOM や fetch に依存しないため、ユニットテスト可能（calendar.test.ts）。
 *
 * 全予定 JST（Asia/Tokyo）前提。API 呼び出し時に timeZone=Asia/Tokyo を付ける。
 */

export type CalendarKind = '祭り・イベント' | '練習';

/** Google Calendar API v3 Events リソースのうち本機能で使うフィールド。 */
export interface RawGCalEvent {
  id?: string;
  status?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  recurringEventId?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

/** 表示用に正規化した予定。 */
export interface CalendarEvent {
  id: string;
  title: string;
  kind: CalendarKind;
  isAllDay: boolean;
  /** グルーピング用の開始日 'YYYY-MM-DD'（時刻ありでも日付部分）。 */
  startDate: string;
  /** 表示用の最終日 'YYYY-MM-DD'（inclusive）。単日なら startDate と同じ。 */
  endInclusive: string;
  /** 時刻あり予定の開始時刻 'HH:MM'。終日は null。 */
  startTime: string | null;
  location: string | null;
  recurring: boolean;
  htmlLink: string | null;
}

/** 'YYYY-MM-DD' の前日を返す（UTC 基準で TZ に左右されない）。 */
export function previousDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' / ISO から 'YYYY-MM' を返す（月グルーピング用）。 */
export function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/**
 * 1件を正規化する。表示対象外（キャンセル / ？始まり / 開始日なし）は null。
 * - 終日: start.date あり。end.date は排他なので最終日は -1 日。
 * - 時刻あり: start.dateTime（JST の +09:00 付き）から 'HH:MM' を取り出す。
 */
export function normalizeEvent(raw: RawGCalEvent, kind: CalendarKind): CalendarEvent | null {
  if (raw.status === 'cancelled') return null;

  const title = (raw.summary ?? '').trim();
  if (title.startsWith('？')) return null; // 日程未定マーカー

  const isAllDay = Boolean(raw.start?.date);
  const startRaw = raw.start?.date ?? raw.start?.dateTime;
  if (!startRaw) return null;

  const startDate = startRaw.slice(0, 10);
  let endInclusive = startDate;
  let startTime: string | null = null;

  if (isAllDay) {
    const endDate = raw.end?.date;
    if (endDate) {
      const inclusive = previousDate(endDate); // 排他 → inclusive
      endInclusive = inclusive < startDate ? startDate : inclusive;
    }
  } else {
    const m = (raw.start?.dateTime ?? '').match(/T(\d{2}:\d{2})/);
    startTime = m ? m[1] : null;
  }

  return {
    id: raw.id ?? `${startRaw}-${title}`,
    title: title || '(無題)',
    kind,
    isAllDay,
    startDate,
    endInclusive,
    startTime,
    location: raw.location ?? null,
    recurring: Boolean(raw.recurringEventId),
    htmlLink: raw.htmlLink ?? null,
  };
}

/** 開始日昇順。同日では終日を時刻ありより前に、時刻ありは時刻昇順。 */
export function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
  if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
  const ta = a.startTime ?? '';
  const tb = b.startTime ?? '';
  return ta < tb ? -1 : ta > tb ? 1 : 0;
}

/** 複数カレンダー分の生イベントを正規化・除外・並び替えして返す。 */
export function normalizeEvents(
  input: Array<{ raw: RawGCalEvent; kind: CalendarKind }>
): CalendarEvent[] {
  return input
    .map(({ raw, kind }) => normalizeEvent(raw, kind))
    .filter((e): e is CalendarEvent => e !== null)
    .sort(compareEvents);
}

/**
 * 複数日にまたがる予定の範囲表記。単日は null（呼び出し側で単日表示）。
 * - 同月内: `27-28`
 * - 月またぎ: `6/30-7/2`
 */
export function formatDateRange(startDate: string, endInclusive: string): string | null {
  if (startDate === endInclusive) return null;
  const [, sm, sd] = startDate.split('-').map(Number);
  const [, em, ed] = endInclusive.split('-').map(Number);
  if (sm === em) return `${sd}-${ed}`;
  return `${sm}/${sd}-${em}/${ed}`;
}

// ---------------------------------------------------------------------------
// 月カレンダー表示（/schedule/）とトップのカード用（2026-11 見やすさ改善）
// ---------------------------------------------------------------------------

/** 'YYYY-MM-DD' を作る（月は 1 始まり）。 */
export function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 日本時間の今日（'YYYY-MM-DD'）。 */
export function todayInTokyo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(now);
}

/**
 * 前の月の1日（'YYYY-MM-01'）。/api/calendar はここから取得し、/schedule/ はここより前に戻れない。
 * 取得範囲と表示できる月を揃えるため、両方がこの関数を使う。
 */
export function previousMonthStart(today: string): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return m === 1 ? ymd(y - 1, 12, 1) : ymd(y, m - 1, 1);
}

/** その日の曜日（0=日）。TZ に左右されないよう UTC で計算。 */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** 第 n 月曜日の日付（日）。 */
function nthMonday(y: number, m: number, n: number): number {
  const first = weekdayOf(ymd(y, m, 1));
  return 1 + ((8 - first) % 7) + (n - 1) * 7;
}

/** 春分・秋分の日（1980〜2099 年の近似式）。 */
function equinoxDay(y: number, spring: boolean): number {
  const base = spring ? 20.8431 : 23.2488;
  return Math.floor(base + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}

/**
 * 日本の祝日（振替休日・国民の休日を含む）を 'YYYY-MM-DD' の集合で返す。
 * 2020 年以降の祝日法を前提にした計算（東京五輪の特例年は考慮しない）。
 */
export function japaneseHolidays(y: number): Set<string> {
  const base: string[] = [
    ymd(y, 1, 1),
    ymd(y, 1, nthMonday(y, 1, 2)),
    ymd(y, 2, 11),
    ymd(y, 2, 23),
    ymd(y, 3, equinoxDay(y, true)),
    ymd(y, 4, 29),
    ymd(y, 5, 3),
    ymd(y, 5, 4),
    ymd(y, 5, 5),
    ymd(y, 7, nthMonday(y, 7, 3)),
    ymd(y, 8, 11),
    ymd(y, 9, nthMonday(y, 9, 3)),
    ymd(y, 9, equinoxDay(y, false)),
    ymd(y, 10, nthMonday(y, 10, 2)),
    ymd(y, 11, 3),
    ymd(y, 11, 23),
  ];
  const set = new Set(base);
  // 国民の休日：前後が祝日の平日
  for (const d of base) {
    const mid = addDays(d, 1);
    if (!set.has(mid) && set.has(addDays(d, 2)) && weekdayOf(mid) !== 0) set.add(mid);
  }
  // 振替休日：日曜の祝日の後の、最初の祝日でない日
  for (const d of [...set].sort()) {
    if (weekdayOf(d) !== 0) continue;
    let n = addDays(d, 1);
    while (set.has(n)) n = addDays(n, 1);
    set.add(n);
  }
  return set;
}

/** 予定が終わっているか（最終日が今日より前）。 */
export function isPastEvent(ev: Pick<CalendarEvent, 'endInclusive'>, today: string): boolean {
  return ev.endInclusive < today;
}

/** 今日以降（今日に終わる・期間中を含む）の予定を先頭から n 件。同じ日でも別々に数える。 */
export function upcomingEvents(events: CalendarEvent[], today: string, n: number): CalendarEvent[] {
  return events.filter((e) => !isPastEvent(e, today)).sort(compareEvents).slice(0, n);
}

/** 帯の1区切り（週ごとに分けた予定）。 */
export interface WeekSegment {
  event: CalendarEvent;
  /** 週内の開始列（0=日曜）。 */
  col: number;
  span: number;
  /** この区切りが予定の初日を含むか／最終日を含むか。 */
  head: boolean;
  tail: boolean;
  multi: boolean;
  lane: number;
}

export interface MonthWeek {
  /** 7要素。月外のマスは null。 */
  days: Array<string | null>;
  segments: WeekSegment[];
  laneCount: number;
}

/**
 * 月カレンダーを週ごとに組み立て、予定を帯の区切りに分けて段（lane）に積む。
 * 2日以上の予定を上の段に優先して置く。
 */
export function buildMonthWeeks(y: number, m: number, events: CalendarEvent[]): MonthWeek[] {
  const first = weekdayOf(ymd(y, m, 1));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: Array<string | null> = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= last; d++) cells.push(ymd(y, m, d));
  while (cells.length % 7) cells.push(null);

  const weeks: MonthWeek[] = [];
  for (let w = 0; w < cells.length / 7; w++) {
    const days = cells.slice(w * 7, w * 7 + 7);
    const segs: WeekSegment[] = [];
    for (const ev of events) {
      const cols = days
        .map((d, c) => (d && d >= ev.startDate && d <= ev.endInclusive ? c : -1))
        .filter((c) => c >= 0);
      if (!cols.length) continue;
      const c0 = cols[0];
      const c1 = cols[cols.length - 1];
      segs.push({
        event: ev,
        col: c0,
        span: c1 - c0 + 1,
        head: days[c0] === ev.startDate,
        tail: days[c1] === ev.endInclusive,
        multi: ev.endInclusive > ev.startDate,
        lane: 0,
      });
    }
    segs.sort((a, b) => Number(b.multi) - Number(a.multi) || a.col - b.col || b.span - a.span);
    const lanes: WeekSegment[][] = [];
    for (const sg of segs) {
      let L = 0;
      while ((lanes[L] ?? []).some((o) => !(sg.col + sg.span <= o.col || o.col + o.span <= sg.col))) L++;
      if (!lanes[L]) lanes[L] = [];
      lanes[L].push(sg);
      sg.lane = L;
    }
    weeks.push({ days, segments: segs, laneCount: lanes.length });
  }
  return weeks;
}
