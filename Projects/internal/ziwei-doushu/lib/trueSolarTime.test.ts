import { describe, it, expect } from 'vitest';
import {
  equationOfTime,
  toTrueSolarTime,
  hourToTimeIndex,
} from './trueSolarTime';

describe('hourToTimeIndex — 小時轉 iztro 時辰索引', () => {
  it('早子時 00:00 → 0', () => {
    expect(hourToTimeIndex(0)).toBe(0);
  });
  it('晚子時 23:00 → 12', () => {
    expect(hourToTimeIndex(23)).toBe(12);
  });
  it('丑時 (01,02) → 1', () => {
    expect(hourToTimeIndex(1)).toBe(1);
    expect(hourToTimeIndex(2)).toBe(1);
  });
  it('午時 (11,12) → 6', () => {
    expect(hourToTimeIndex(11)).toBe(6);
    expect(hourToTimeIndex(12)).toBe(6);
  });
  it('未時 13 → 7、亥時 21/22 → 11', () => {
    expect(hourToTimeIndex(13)).toBe(7);
    expect(hourToTimeIndex(21)).toBe(11);
    expect(hourToTimeIndex(22)).toBe(11);
  });
});

describe('equationOfTime — 均時差', () => {
  it('回傳有限數值,且全年落在合理範圍 (±20 分鐘內)', () => {
    for (const [m, d] of [[1, 15], [4, 1], [8, 16], [11, 3], [12, 25]] as const) {
      const eot = equationOfTime(2000, m, d);
      expect(Number.isFinite(eot)).toBe(true);
      expect(Math.abs(eot)).toBeLessThan(20);
    }
  });
});

describe('toTrueSolarTime — 真太陽時校正', () => {
  it('台北 (東經 121.5、UTC+8):經度校正應為 +6 分鐘', () => {
    const r = toTrueSolarTime({
      year: 2000, month: 8, day: 16, hour: 14, minute: 30,
      longitude: 121.5, tzOffsetHours: 8,
    });
    // (121.5 - 120) * 4 = 6
    expect(r.longitudeCorrection).toBeCloseTo(6, 1);
    expect(r.eotCorrection).toBeCloseTo(
      Math.round(equationOfTime(2000, 8, 16) * 10) / 10,
      1,
    );
    expect(r.correctionMinutes).toBeCloseTo(
      Math.round((r.longitudeCorrection + r.eotCorrection) * 10) / 10,
      1,
    );
  });

  it('剛好在時區標準經線上 (東經 120、UTC+8):經度校正為 0', () => {
    const r = toTrueSolarTime({
      year: 2000, month: 3, day: 21, hour: 12, minute: 0,
      longitude: 120, tzOffsetHours: 8,
    });
    expect(r.longitudeCorrection).toBe(0);
  });

  it('可正確跨日:大幅正向校正使 23:30 進到隔日', () => {
    // 東經 135、UTC+8 → 經度校正 (135-120)*4 = +60 分鐘
    // 23:30 + 60(+eot) → 隔日凌晨,日期應 +1
    const r = toTrueSolarTime({
      year: 2000, month: 6, day: 15, hour: 23, minute: 30,
      longitude: 135, tzOffsetHours: 8,
    });
    expect(r.longitudeCorrection).toBeCloseTo(60, 1);
    expect(r.day).toBe(16);
    expect(r.month).toBe(6);
  });
});
