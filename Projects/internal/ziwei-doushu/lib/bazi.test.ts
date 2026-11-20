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

  it('喜用神/格局(扶抑法):丙日申月失令 → 身弱、喜木火、偏財格', () => {
    expect(r.analysis.dayElement).toBe('火');
    expect(r.analysis.strength).toBe('身弱');
    expect(r.analysis.favorable.sort()).toEqual(['木', '火'].sort());
    expect(r.analysis.pattern).toBe('偏財格');
  });
});

/**
 * 大運命例(lunar-javascript 依節氣精算;與 bazi-skill scripts/pai_pan.py 交叉核對,
 *   2026-11-20 跑 pai_pan.py 兩例:方向、起運、前三步干支皆一致;
 *   pai_pan 年齡為周歲(3–12),本站沿 lunar 為虛歲(4–13),起訖年份相同)。
 */
describe('computeBazi — 大運/流年', () => {
  it('女陽年逆排:2000-08-16 14:30 庚辰年女 → 3 歲起運,癸未/壬午/辛巳', () => {
    const r = computeBazi({
      year: 2000, month: 8, day: 16, hour: 14, minute: 30, gender: '女', calendar: 'solar',
      asOf: { year: 2026, month: 11, day: 20 },
    });
    expect(r.luck.forward).toBe(false);
    expect(r.luck.start).toEqual({ years: 3, months: 0, days: 0 });
    expect(r.luck.steps).toHaveLength(8);
    expect(r.luck.steps.slice(0, 3).map((s) => s.ganZhi)).toEqual(['癸未', '壬午', '辛巳']);
    expect(r.luck.steps[0]).toMatchObject({ startYear: 2003, endYear: 2012 });
    // 2026 丙午年落在第三步辛巳(2023–2032)
    expect(r.luck.liuNian).toEqual({ year: 2026, ganZhi: '丙午' });
    expect(r.luck.currentIndex).toBe(2);
  });

  it('男陽年順排:1984-02-10 08:00 甲子年男 → 8 年 1 月 20 日起運,丁卯/戊辰/己巳', () => {
    const r = computeBazi({
      year: 1984, month: 2, day: 10, hour: 8, minute: 0, gender: '男', calendar: 'solar',
      asOf: { year: 2026, month: 1, day: 20 },
    });
    expect(r.pillars.month.ganZhi).toBe('丙寅');
    expect(r.luck.forward).toBe(true);
    expect(r.luck.start).toEqual({ years: 8, months: 1, days: 20 });
    expect(r.luck.steps.slice(0, 3).map((s) => s.ganZhi)).toEqual(['丁卯', '戊辰', '己巳']);
    // 2026-01-20 在立春前 → 流年仍為 2025 乙巳
    expect(r.luck.liuNian).toEqual({ year: 2025, ganZhi: '乙巳' });
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
