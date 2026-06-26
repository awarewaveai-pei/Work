import { describe, it, expect } from 'vitest';
import { computeDailyFortune, dailyCacheKey, dailyContext } from './daily';

const birth = {
  year: 2000, month: 8, day: 16, hour: 14, minute: 30,
  gender: '女' as const, calendar: 'solar' as const,
};

describe('每日運勢工廠', () => {
  const f = computeDailyFortune(birth, { year: 2026, month: 6, day: 24 }, 'zh-TW');

  it('丙日身弱 → 真喜用神(扶抑法)首位=木 → 幸運色綠/青、方位東、數字3/8', () => {
    expect(f.strength).toBe('身弱');
    expect(f.luckyElement).toBe(f.favorable[0]); // 由真喜用神決定,非恆取印
    expect(f.luckyElement).toBe('木');
    expect(f.luckyColors).toEqual(['綠', '青']);
    expect(f.luckyNumbers).toEqual([3, 8]);
    expect(f.luckyDirection).toBe('東');
  });

  it('命局摘要欄位帶入(供 AI 文案)', () => {
    expect(f.dayMaster).toBe('丙');
    expect(f.pattern).toBe('偏財格');
    expect(f.favorable.length).toBeGreaterThan(0);
  });

  it('dailyContext → systemId=bazi、headline 今日 + 含評分/宜忌 facts', () => {
    const ctx = dailyContext(f, 'zh-TW');
    expect(ctx.systemId).toBe('bazi');
    expect(ctx.headline).toContain(f.date);
    expect(ctx.facts.find((x) => x.label === 'favorable')?.value).toBeTruthy();
    expect(ctx.facts.some((x) => x.label === 'scoreOverall')).toBe(true);
  });

  it('英文 locale → 幸運色/方位在地化', () => {
    const fe = computeDailyFortune(birth, { year: 2026, month: 6, day: 24 }, 'en');
    expect(fe.luckyColors).toEqual(['Green', 'Teal']);
    expect(fe.luckyDirection).toBe('East');
  });

  it('所有評分落在 1–5', () => {
    for (const s of Object.values(f.scores)) {
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(5);
    }
  });

  it('確定性:同人同日同語言結果一致(可快取)', () => {
    const g = computeDailyFortune(birth, { year: 2026, month: 6, day: 24 }, 'zh-TW');
    expect(g).toEqual(f);
  });

  it('宜忌來自黃曆(非空)', () => {
    expect(f.yi.length).toBeGreaterThan(0);
    expect(f.ji.length).toBeGreaterThan(0);
  });

  it('快取鍵含 chart+date+locale', () => {
    expect(dailyCacheKey('abc', '2026-06-24', 'en')).toBe('abc|2026-06-24|en');
  });
});
