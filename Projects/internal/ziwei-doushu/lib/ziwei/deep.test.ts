import { describe, it, expect } from 'vitest';
import { computeChart, type ChartRequest } from '@/lib/ziwei';
import { computeZiweiDeepFacts, type ZiweiDeepFacts } from './deep';
import { analyzeBrightness } from './brightness';

// 三張已知命盤(卡 Z1 驗收):一般盤、農曆閏月盤、晚子時跨日盤
const A: ChartRequest = {
  year: 2000, month: 8, day: 16, hour: 14, minute: 30, gender: '女', calendar: 'solar',
  place: { label: '台北', lat: 25.03, lon: 121.5, zone: 'Etc/GMT-8' }, trueSolar: true, locale: 'zh-TW',
};
const LEAP: ChartRequest = {
  year: 2023, month: 2, day: 15, hour: 10, minute: 0, gender: '男', calendar: 'lunar', isLeapMonth: true, locale: 'zh-TW',
};
const LATE_ZI: ChartRequest = {
  year: 1990, month: 3, day: 21, hour: 23, minute: 30, gender: '男', calendar: 'solar', locale: 'zh-TW',
};

const deep = (req: ChartRequest, date: string): ZiweiDeepFacts =>
  computeZiweiDeepFacts(computeChart(req).astrolabe, date);
const byId = (d: ZiweiDeepFacts, id: string) => {
  const f = d.facts.find((x) => x.id === id);
  if (!f) throw new Error(`no fact ${id}`);
  return f;
};

describe('紫微深度計算 Z1:快照與決定論', () => {
  const cases: [string, ChartRequest, string][] = [
    ['一般盤 2000-08-16 未時 女 @2026-11-29', A, '2026-11-29'],
    ['閏月盤 農曆2023閏二月十五 巳時 男 @2025-8-1', LEAP, '2025-8-1'],
    ['晚子時盤 1990-03-21 23:30 男 @2027-1-15', LATE_ZI, '2027-1-15'],
  ];
  for (const [name, req, date] of cases) {
    it(`${name}:facts 快照;同輸入兩次逐位元組相同;id 不重複`, () => {
      const first = deep(req, date);
      const second = deep(req, date);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      expect(new Set(first.facts.map((f) => f.id)).size).toBe(first.facts.length);
      expect(first).toMatchSnapshot();
    });
  }
});

describe('紫微深度計算 Z1:手算對照(盤 A:命宮丑、庚辰年陽女、火六局;目標 2026 丙午)', () => {
  const d = deep(A, '2026-11-29');

  it('三方四正:命宮在丑 → 對宮未(遷移)、三合巳(官祿)酉(財帛)', () => {
    // 手算:丑+6=未;丑的三合局為巳酉丑
    const f = byId(d, 'surround:命宮');
    expect(f.palaces).toEqual(['命宮', '遷移', '官祿', '財帛']);
    // 吉:天魁(本宮)、天鉞(對宮) 2 顆;煞:陀羅(對宮)、鈴星(官祿)、擎羊火星(財帛) 4 顆 → 2/6=33% → 留意
    expect(f.detail.fortuneIndex).toBe(33);
    expect(analyzeBrightness(computeChart(A).astrolabe).fortuneIndex).toBe(33); // 與既有命宮指標同一算法
    expect(f.tone).toBe('caution');
    // 生年化忌天同在子女(戌),子女宮的三方四正 fact 是化忌落點鉤子
    expect(byId(d, 'surround:子女').hook).toBe(true);
  });

  it('三合:巳酉丑金局 = 官祿、財帛、命宮', () => {
    expect(byId(d, 'sanhe:巳酉丑').palaces).toEqual(['官祿', '財帛', '命宮']);
  });

  it('六合:子丑合 = 兄弟(子)、命宮(丑)', () => {
    expect(byId(d, 'liuhe:子丑').palaces).toEqual(['兄弟', '命宮']);
  });

  it('相夾:祿存在申 → 擎羊在酉、陀羅在未,疾厄被羊陀夾;太陽子、太陰寅夾命宮丑', () => {
    // 手算:祿存前一位擎羊、後一位陀羅(安祿存羊陀訣)
    expect(byId(d, 'jia:疾厄:羊陀').tone).toBe('caution');
    // 太陽在子落陷 → 日月夾不論吉,標吉凶並見
    const ry = byId(d, 'jia:命宮:日月');
    expect(ry.detail.brightness).toBe('太陽陷、太陰旺');
    expect(ry.tone).toBe('mixed');
  });

  it('大限:陽女逆行,丑6–15、子16–25、亥26–35;2026 虛歲27 → 亥(夫妻),宮干丁', () => {
    // 手算:虛歲 2026-2000+1=27;庚年五虎遁寅起戊 → 亥=丁
    const f = byId(d, 'decadal:命宮');
    expect(f.palaces).toEqual(['夫妻']);
    expect(f.detail.ageRange).toBe('26-35');
    expect(f.detail.stem).toBe('丁');
    // 丁干四化:太陰祿、天同權、天機科、巨門忌;巨門在辰(田宅),即大限僕役宮
    const ji = byId(d, 'decadal:化忌');
    expect(ji.stars).toEqual(['巨門']);
    expect(ji.palaces).toEqual(['田宅']);
    expect(ji.detail.scopePalace).toBe('僕役');
    expect(byId(d, 'decadal_timeline:6').palaces).toEqual(['命宮']);
  });

  it('流年:丙午年流年命宮在午(僕役);十二宮由午逆排,辰=流年夫妻;丙干廉貞忌入未(遷移)', () => {
    expect(byId(d, 'yearly:命宮').palaces).toEqual(['僕役']);
    // 手算:午命、巳兄弟、辰夫妻
    expect(byId(d, 'yearly_overlay:田宅').detail.yearlyPalace).toBe('夫妻');
    const ji = byId(d, 'yearly:化忌');
    expect(ji.stars).toEqual(['廉貞']);
    expect(ji.palaces).toEqual(['遷移']);
    expect(ji.hook).toBe(true);
  });

  it('疊宮:2030 庚戌年天同化忌回到本命化忌的子女宮 → 雙忌;太陽化祿回兄弟 → 雙祿', () => {
    // 手算:庚干(iztro 表)太陽祿、武曲權、太陰科、天同忌;本命庚辰年同一表
    const d30 = deep(A, '2030-6-1');
    expect(byId(d30, 'stack:忌:子女').detail.kind).toBe('雙忌');
    expect(byId(d30, 'stack:祿:兄弟').detail.layers).toEqual(['本命', '流年']);
    expect(d.facts.some((f) => f.category === 'mutagen_stack')).toBe(false);
  });

  it('流月:斗君 — 午年從午逆數到生月七月得子,再順數到未時得未 → 正月在未(遷移)', () => {
    const m1 = byId(d, 'monthly:2026-1');
    expect(m1.palaces[0]).toBe('遷移');
    expect(m1.detail.stem).toBe('庚'); // 丙辛年正月起庚寅
    // 七月丙申:流月命宮在丑(命宮);廉貞化忌在未 = 對宮,天同化祿在戌不在三方四正 → 留意
    const m7 = byId(d, 'monthly:2026-7');
    expect(m7.palaces[0]).toBe('命宮');
    expect(m7.tone).toBe('caution');
    expect(d.facts.filter((f) => f.category === 'monthly')).toHaveLength(12);
  });
});

describe('紫微深度計算 Z1:閏月與跨日', () => {
  it('閏月盤:農曆2023閏二月十五 = 國曆2023-4-5;2025 有閏六月 → 流月 14 段(閏六上、下半)', () => {
    const a = computeChart(LEAP).astrolabe;
    expect(a.solarDate).toBe('2023-4-5');
    const d = computeZiweiDeepFacts(a, '2025-8-1');
    const ids = d.facts.filter((f) => f.category === 'monthly').map((f) => f.id);
    expect(ids).toHaveLength(14);
    expect(ids).toContain('monthly:2025-閏6上');
    expect(ids).toContain('monthly:2025-閏6下');
  });

  it('晚子時盤:23:30 仍算當天(本站 dayDivide=current)→ 農曆二月廿五;2027-1-15 早於正月初一(2-6)仍屬 2026 年', () => {
    // 手算:1990 二月初一 = 國曆 2-25,3-21 為廿五;庚午陽男順行,土五局 卯5–14 辰15–24 巳25–34 午35–44
    const a = computeChart(LATE_ZI).astrolabe;
    expect(a.lunarDate).toBe('一九九〇年二月廿五');
    expect(a.time).toBe('晚子時');
    const d = computeZiweiDeepFacts(a, '2027-1-15');
    expect(d.lunarYear).toBe(2026);
    expect(byId(d, 'yearly:命宮').detail.stem).toBe('丙'); // lunar-javascript 年界與 iztro 流年一致
    expect(byId(d, 'decadal:命宮').detail.ageRange).toBe('35-44');
    // 壬干天梁化祿入卯(命宮),本命庚干太陽化祿也在卯 → 雙祿
    expect(byId(d, 'stack:祿:命宮').detail.layers).toEqual(['本命', '大限']);
  });
});
