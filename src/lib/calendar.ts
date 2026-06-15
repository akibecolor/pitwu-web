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
