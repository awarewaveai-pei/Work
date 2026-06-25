import { describe, it, expect } from 'vitest';
import { computeBazi } from './bazi';
import { baziSystem } from './divination/systems/bazi';

/**
 * 八字回歸錨點:2000-08-16 14:30 女 國曆(未啟用真太陽時)
 *   → 四柱 庚辰 / 甲申 / 丙午 / 乙未,日主 丙,生肖 龍。
 * (lunar-javascript 標準輸出,簡體經繁中正規化)
 */
describe('computeBazi — 八字回歸', () => {
  const r = computeBazi({
    year: 2000, month: 8, day: 16, hour: 14, minute: 30, gender: '女', calendar: 'solar',
  });

  it('四柱干支', () => {
    expect(r.pillars.year.ganZhi).toBe('庚辰');
    expect(r.pillars.month.ganZhi).toBe('甲申');
    expect(r.pillars.day.ganZhi).toBe('丙午');
    expect(r.pillars.hour.ganZhi).toBe('乙未');
  });

  it('日主 丙、生肖 龍(繁中正規化)', () => {
    expect(r.dayMaster).toBe('丙');
    expect(r.zodiac).toBe('龍');
  });

  it('十神繁中正規化:年柱偏財、日柱日主', () => {
    expect(r.pillars.year.shiShen).toBe('偏財');
    expect(r.pillars.day.shiShen).toBe('日主');
  });

  it('真太陽時校正會帶 correction 並可能改時柱', () => {
    const c = computeBazi({
      year: 2000, month: 8, day: 16, hour: 14, minute: 30, gender: '女',
      calendar: 'solar', trueSolar: { longitude: 121.5, tzOffsetHours: 8 },
    });
    expect(c.correction).toBeDefined();
  });
});

describe('八字系統 adapter', () => {
  it('compute → systemId=bazi + 日主 fact', async () => {
    const { context } = await baziSystem.compute(
      { year: 2000, month: 8, day: 16, hour: 14, minute: 30, gender: '女', calendar: 'solar' },
      'zh-TW',
    );
    expect(context.systemId).toBe('bazi');
    expect(context.facts.find((f) => f.label === 'dayMaster')?.value).toBe('丙');
  });
});
