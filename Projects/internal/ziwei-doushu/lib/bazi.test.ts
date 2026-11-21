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
      calendar: 'solar', place: { label: '台北', lat: 25.03, lon: 121.5, zone: 'Etc/GMT-8' }, trueSolar: true,
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

describe('computeBazi — 農曆輸入與繁中用字', () => {
  const base = { hour: 12, minute: 0, gender: '女', calendar: 'solar' } as const;

  it('農曆 2000 正月初一 = 國曆 2000-02-05,四柱相同', () => {
    const lunar = computeBazi({ ...base, year: 2000, month: 1, day: 1, calendar: 'lunar' });
    const solar = computeBazi({ ...base, year: 2000, month: 2, day: 5 });
    expect(lunar.pillars).toEqual(solar.pillars);
  });

  it('閏月:農曆 2001 閏四月初一 = 國曆 2001-05-23', () => {
    const lunar = computeBazi({
      ...base, year: 2001, month: 4, day: 1, calendar: 'lunar', isLeapMonth: true,
    });
    const solar = computeBazi({ ...base, year: 2001, month: 5, day: 23 });
    expect(lunar.pillars).toEqual(solar.pillars);
  });

  it('六十甲子的納音、十二長生、十神、生肖都是繁體', () => {
    const NAYIN = '海中金 爐中火 大林木 路旁土 劍鋒金 山頭火 澗下水 城頭土 白蠟金 楊柳木 泉中水 屋上土 霹靂火 松柏木 長流水 沙中金 山下火 平地木 壁上土 金箔金 覆燈火 天河水 大驛土 釵釧金 桑柘木 大溪水 沙中土 天上火 石榴木 大海水'.split(' ');
    const DISHI = '長生 沐浴 冠帶 臨官 帝旺 衰 病 死 墓 絕 胎 養'.split(' ');
    const SHISHEN = '比肩 劫財 食神 傷官 偏財 正財 七殺 正官 偏印 正印 日主'.split(' ');
    const ZODIAC = [...'鼠牛虎兔龍蛇馬羊猴雞狗豬'];
    const seenNaYin = new Set<string>();
    for (let i = 0; i < 60; i++) {
      // 每 61 天取一日、時辰輪轉 → 涵蓋六十日柱與十二生肖年
      const d = new Date(Date.UTC(1990, 0, 1 + i * 61));
      const r = computeBazi({
        ...base, hour: (i * 2) % 24,
        year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
      });
      expect(ZODIAC).toContain(r.zodiac);
      for (const p of Object.values(r.pillars)) {
        expect(NAYIN).toContain(p.naYin);
        expect(DISHI).toContain(p.diShi);
        expect(SHISHEN).toContain(p.shiShen);
        seenNaYin.add(p.naYin);
      }
    }
    expect(seenNaYin.size).toBe(30);
  });
});

describe('computeBazi — 出生地時區(E5)', () => {
  const newYork = { label: 'New York', lat: 40.71, lon: -74.01, zone: 'America/New_York' };
  const taipei = { label: '台北', lat: 25.03, lon: 121.5, zone: 'Asia/Taipei' };

  it('紐約 2000-02-04 08:00(北京 21:00,已過 20:40 立春):年月柱依北京時間的節氣、日時柱依當地真太陽時', () => {
    const r = computeBazi({
      year: 2000, month: 2, day: 4, hour: 8, minute: 0, gender: '男', calendar: 'solar',
      place: newYork, trueSolar: true,
    });
    expect(r.zone).toEqual({ timeZone: 'America/New_York', utcOffsetHours: -5, dst: false });
    expect([r.pillars.year.ganZhi, r.pillars.month.ganZhi]).toEqual(['庚辰', '戊寅']);
    // 當地真太陽時約 07:50 → 辰時
    expect([r.pillars.day.ganZhi, r.pillars.hour.ganZhi]).toEqual(['壬辰', '甲辰']);
  });

  it('台北 1975-07-01 13:30 實施夏令時間 = 標準時 12:30 → 午時(不是未時)', () => {
    const r = computeBazi({
      year: 1975, month: 7, day: 1, hour: 13, minute: 30, gender: '男', calendar: 'solar', place: taipei,
    });
    expect(r.zone).toEqual({ timeZone: 'Asia/Taipei', utcOffsetHours: 9, dst: true });
    expect(r.pillars.hour.ganZhi).toBe('戊午');
  });

  it('晚子時選「23 點算隔天」:日柱換成隔天', () => {
    const base = { year: 2000, month: 8, day: 16, hour: 23, minute: 30, gender: '女' as const, calendar: 'solar' as const };
    expect(computeBazi(base).pillars.day.ganZhi).toBe('丙午');
    expect(computeBazi({ ...base, dayDivide: 'forward' }).pillars.day.ganZhi).toBe('丁未');
  });
});
