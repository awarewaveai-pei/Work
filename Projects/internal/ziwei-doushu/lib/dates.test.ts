import { describe, it, expect } from 'vitest';
import { toSolarYmd } from './dates';
import { localToday } from './today';

describe('toSolarYmd', () => {
  it('國曆原樣回傳', () => {
    expect(toSolarYmd({ year: 2000, month: 8, day: 16, calendar: 'solar' })).toEqual({ year: 2000, month: 8, day: 16 });
  });

  it('農曆轉國曆,閏月另算', () => {
    expect(toSolarYmd({ year: 1990, month: 2, day: 30, calendar: 'lunar' })).toEqual({ year: 1990, month: 3, day: 26 });
    expect(toSolarYmd({ year: 1990, month: 5, day: 15, calendar: 'lunar', isLeapMonth: true })).toEqual({ year: 1990, month: 7, day: 7 });
  });

  it('不存在的國曆日期拋錯', () => {
    expect(() => toSolarYmd({ year: 2023, month: 2, day: 30, calendar: 'solar' })).toThrow();
    expect(toSolarYmd({ year: 2024, month: 2, day: 29, calendar: 'solar' })).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it('該年沒有的閏月拋錯', () => {
    expect(() => toSolarYmd({ year: 1991, month: 5, day: 15, calendar: 'lunar', isLeapMonth: true })).toThrow();
  });
});

describe('localToday', () => {
  it('取本地日期欄位,不經 UTC', () => {
    // 本地 2026-01-01 07:00:在 UTC+8 的 toISOString() 是 2025-12-31
    expect(localToday(new Date(2026, 0, 1, 7, 0))).toEqual({ year: 2026, month: 1, day: 1 });
  });
});
