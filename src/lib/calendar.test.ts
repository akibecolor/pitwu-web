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
