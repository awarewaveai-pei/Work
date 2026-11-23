import { describe, it, expect } from 'vitest';
import { LunarUtil } from 'lunar-javascript';
import { toTraditional } from './s2t';
import { ALMANAC_FIXES } from './daily';
import { PENGZU_EN, SPIRIT_EN, YIJI_EN, fetusGodEn, ganZhiPinyin, lookupEn } from './almanacEn';

/** 庫內部表的形狀(types/lunar-javascript.d.ts 沒宣告這幾個)。 */
const U = LunarUtil as unknown as {
  JIA_ZI: string[];
  PENGZU_GAN: string[];
  PENGZU_ZHI: string[];
  POSITION_TAI_DAY: string[];
  getDayYi(monthGanZhi: string, dayGanZhi: string): string[];
  getDayJi(monthGanZhi: string, dayGanZhi: string): string[];
  getDayJiShen(monthZhiIndex: number, dayGanZhi: string): string[];
  getDayXiongSha(monthZhiIndex: number, dayGanZhi: string): string[];
};
// 與 lib/daily.ts 相同的鍵:改正字後轉繁體
const tw = (raw: string) => toTraditional(ALMANAC_FIXES.reduce((acc, [f, t]) => acc.split(f).join(t), raw));
// 表裡要有這個鍵(值 null = 英文刻意不列,也算涵蓋)
const missing = (terms: Iterable<string>, table: Readonly<Record<string, string | null>>) =>
  [...new Set([...terms].map(tw))].filter((x) => x !== '無' && !Object.prototype.hasOwnProperty.call(table, x));

describe('黃曆英文表涵蓋 lunar-javascript 的全部可能輸出', () => {
  const jiaZi = U.JIA_ZI.map((x) => x);

  it('宜忌:60 月干支 × 60 日干支', () => {
    const all: string[] = [];
    for (const m of jiaZi) for (const d of jiaZi) all.push(...U.getDayYi(m, d), ...U.getDayJi(m, d));
    expect(new Set(all).size).toBeGreaterThan(100); // 真的有窮舉到
    expect(missing(all, YIJI_EN)).toEqual([]);
  });

  it('日吉神／日凶煞:12 月支 × 60 日干支', () => {
    const all: string[] = [];
    for (let m = 0; m < 12; m++) for (const d of jiaZi) all.push(...U.getDayJiShen(m, d), ...U.getDayXiongSha(m, d));
    expect(new Set(all).size).toBeGreaterThan(140);
    expect(missing(all, SPIRIT_EN)).toEqual([]);
  });

  it('彭祖百忌 22 句、胎神 60 日、沖煞干支 60 個', () => {
    expect(missing([...U.PENGZU_GAN.slice(1), ...U.PENGZU_ZHI.slice(1)], PENGZU_EN)).toEqual([]);
    expect(U.POSITION_TAI_DAY.map(tw).filter((x) => fetusGodEn(x) === null)).toEqual([]);
    expect(jiaZi.map(tw).filter((x) => ganZhiPinyin(x) === null)).toEqual([]);
  });
});

describe('英文不列醫療類事項(站規:不給醫療結論)', () => {
  it('求醫、治病、針灸、探病 → null', () => {
    for (const t of ['求醫', '治病', '針灸', '探病']) expect(lookupEn(YIJI_EN, t)).toBeNull();
  });
});

describe('胎神占方英文', () => {
  it('「占」不譯、長詞優先、房內／外', () => {
    expect(fetusGodEn('占門床 外正南')).toBe('Door and bed; outside the house, south');
    expect(fetusGodEn('倉庫門 房內北')).toBe('Storehouse and door; inside the bedroom, north side');
    expect(fetusGodEn('房床棲 房內中')).toBe('Room, bed and roost; inside the bedroom, center');
    expect(fetusGodEn('占大門 外東北')).toBe('Main gate; outside the house, northeast');
  });
  it('認不得的字 → null', () => {
    expect(fetusGodEn('占門某 外正南')).toBeNull();
  });
});
