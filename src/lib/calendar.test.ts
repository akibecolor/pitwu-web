import { describe, it, expect } from 'vitest';
import {
  normalizeEvent,
  normalizeEvents,
  previousDate,
  formatDateRange,
  type RawGCalEvent,
} from './calendar.js';

describe('previousDate', () => {
  it('前日を返す（月またぎ）', () => {
    expect(previousDate('2026-07-01')).toBe('2026-06-30');
  });
  it('前日を返す（年またぎ）', () => {
    expect(previousDate('2026-01-01')).toBe('2025-12-31');
  });
});

describe('normalizeEvent', () => {
  it('終日イベントの end.date は排他 → 最終日は -1 日', () => {
    // 6/27〜6/28 の2日間 → end.date=2026-06-29
    const raw: RawGCalEvent = {
      id: 'e1',
      summary: '神戸よさこいまつり',
      start: { date: '2026-06-27' },
      end: { date: '2026-06-29' },
    };
    const ev = normalizeEvent(raw, '祭り・イベント');
    expect(ev).not.toBeNull();
    expect(ev?.isAllDay).toBe(true);
    expect(ev?.startDate).toBe('2026-06-27');
    expect(ev?.endInclusive).toBe('2026-06-28');
    expect(ev?.startTime).toBeNull();
  });

  it('1日だけの終日（end=start+1）は単日扱い（start===endInclusive）', () => {
    const raw: RawGCalEvent = {
      summary: '依頼演舞',
      start: { date: '2026-06-20' },
      end: { date: '2026-06-21' },
    };
    const ev = normalizeEvent(raw, '祭り・イベント');
    expect(ev?.startDate).toBe('2026-06-20');
    expect(ev?.endInclusive).toBe('2026-06-20');
  });

  it('時刻あり予定は HH:MM を取り出す', () => {
    const raw: RawGCalEvent = {
      summary: '水曜練習会',
      start: { dateTime: '2026-06-24T19:00:00+09:00' },
      end: { dateTime: '2026-06-24T21:00:00+09:00' },
    };
    const ev = normalizeEvent(raw, '練習');
    expect(ev?.isAllDay).toBe(false);
    expect(ev?.startDate).toBe('2026-06-24');
    expect(ev?.startTime).toBe('19:00');
  });

  it('status=cancelled は除外（null）', () => {
    const raw: RawGCalEvent = {
      summary: '中止イベント',
      status: 'cancelled',
      start: { date: '2026-06-27' },
      end: { date: '2026-06-28' },
    };
    expect(normalizeEvent(raw, '祭り・イベント')).toBeNull();
  });

  it('？始まり（日程未定）は除外（null）', () => {
    const raw: RawGCalEvent = {
      summary: '？秋の依頼演舞',
      start: { date: '2026-10-01' },
      end: { date: '2026-10-02' },
    };
    expect(normalizeEvent(raw, '祭り・イベント')).toBeNull();
  });

  it('開始日が無ければ除外（null）', () => {
    expect(normalizeEvent({ summary: 'x' }, '練習')).toBeNull();
  });

  it('取得元カレンダーの kind を付与する', () => {
    const ev = normalizeEvent({ summary: '練習', start: { date: '2026-06-01' } }, '練習');
    expect(ev?.kind).toBe('練習');
  });

  it('recurringEventId があれば recurring=true', () => {
    const ev = normalizeEvent(
      { summary: '定期練習', start: { date: '2026-06-01' }, recurringEventId: 'r1' },
      '練習'
    );
    expect(ev?.recurring).toBe(true);
  });
});

describe('normalizeEvents', () => {
  it('除外と並び替え（開始日昇順・同日は終日が先）をまとめて行う', () => {
    const events = normalizeEvents([
      { raw: { summary: '時刻練習', start: { dateTime: '2026-06-24T19:00:00+09:00' } }, kind: '練習' },
      { raw: { summary: '？未定', start: { date: '2026-06-25' } }, kind: '祭り・イベント' },
      { raw: { summary: '終日祭り', start: { date: '2026-06-24' }, end: { date: '2026-06-25' } }, kind: '祭り・イベント' },
      { raw: { summary: '前の予定', start: { date: '2026-06-01' } }, kind: '祭り・イベント' },
    ]);
    expect(events.map((e) => e.title)).toEqual(['前の予定', '終日祭り', '時刻練習']);
  });
});

describe('formatDateRange', () => {
  it('単日は null', () => {
    expect(formatDateRange('2026-06-27', '2026-06-27')).toBeNull();
  });
  it('同月内は 27-28', () => {
    expect(formatDateRange('2026-06-27', '2026-06-28')).toBe('27-28');
  });
  it('月またぎは 6/30-7/2', () => {
    expect(formatDateRange('2026-06-30', '2026-07-02')).toBe('6/30-7/2');
  });
});

import {
  japaneseHolidays,
  buildMonthWeeks,
  upcomingEvents,
  isPastEvent,
  type CalendarEvent,
} from './calendar.js';

const ev = (id: string, s: string, e = s, t: string | null = null): CalendarEvent => ({
  id,
  title: id,
  kind: '祭り・イベント',
  isAllDay: t === null,
  startDate: s,
  endInclusive: e,
  startTime: t,
  location: null,
  recurring: false,
  htmlLink: null,
});

describe('japaneseHolidays', () => {
  it('2026 年の祝日（ハッピーマンデー・春分秋分・振替・国民の休日）', () => {
    const h = japaneseHolidays(2026);
    for (const d of ['2026-01-12', '2026-03-20', '2026-05-06', '2026-09-21', '2026-09-22', '2026-09-23', '2026-10-12', '2026-11-03', '2026-11-23']) {
      expect(h.has(d), d).toBe(true);
    }
    expect(h.has('2026-11-24')).toBe(false);
  });
  it('2025 年 11/24 は振替休日', () => {
    expect(japaneseHolidays(2025).has('2025-11-24')).toBe(true);
  });
});

describe('buildMonthWeeks', () => {
  it('2026年11月は日曜始まりで5週、週をまたぐ予定は区切られる', () => {
    const weeks = buildMonthWeeks(2026, 11, [ev('a', '2026-11-28', '2026-11-30'), ev('b', '2026-11-28')]);
    expect(weeks).toHaveLength(5);
    const w4 = weeks[3].segments;
    const a4 = w4.find((s) => s.event.id === 'a');
    expect(a4).toMatchObject({ col: 6, span: 1, head: true, tail: false, multi: true, lane: 0 });
    expect(w4.find((s) => s.event.id === 'b')?.lane).toBe(1);
    expect(weeks[4].segments[0]).toMatchObject({ col: 0, span: 2, head: false, tail: true });
  });
});

describe('upcomingEvents / isPastEvent', () => {
  it('期間中の予定は終わっていない扱い、同じ日も別に数える', () => {
    const list = [ev('old', '2026-11-01'), ev('mid', '2026-11-09', '2026-11-12'), ev('x', '2026-11-15'), ev('y', '2026-11-15', '2026-11-15', '10:00'), ev('z', '2026-11-20')];
    expect(isPastEvent(list[0], '2026-11-11')).toBe(true);
    expect(upcomingEvents(list, '2026-11-11', 3).map((e) => e.id)).toEqual(['mid', 'x', 'y']);
  });
});
