import { describe, it, expect } from 'vitest';
import { findShensha, type ShenshaId } from './baziShensha';
import type { PillarChars, PillarPosition } from './baziRelations';

const chart = (gans: string, zhis: string): PillarChars => ({
  gan: { year: gans[0], month: gans[1], day: gans[2], hour: gans[3] },
  zhi: { year: zhis[0], month: zhis[1], day: zhis[2], hour: zhis[3] },
});
const at = (c: PillarChars, id: ShenshaId): PillarPosition[] | undefined =>
  findShensha(c).find((s) => s.id === id)?.positions;

/**
 * 命例 A:庚辰 甲申 丙午 乙未;命例 B:甲子 丙寅 甲戌 戊辰。
 * 與 bazi-skill pai_pan.py 神煞輸出逐條比對一致(2026-11-20)。
 */
const A = chart('庚甲丙乙', '辰申午未');
const B = chart('甲丙甲戊', '子寅戌辰');

describe('findShensha — 每個神煞一例', () => {
  it('天乙貴人:庚干取丑未寅午、丙干取亥酉 → 日支午、時支未', () => {
    expect(at(A, 'tianYi')).toEqual(['day', 'hour']);
  });
  it('文昌:日干丙見申 → 月支', () => expect(at(A, 'wenChang')).toEqual(['month']));
  it('將星:日支午(寅午戌)見午 → 日支自身', () => expect(at(A, 'jiangXing')).toEqual(['day']));
  it('華蓋:年支辰(申子辰)見辰 → 年支', () => expect(at(A, 'huaGai')).toEqual(['year']));
  it('驛馬:日支午(寅午戌)見申 → 月支', () => expect(at(A, 'yiMa')).toEqual(['month']));
  it('羊刃:丙見午 → 日支', () => expect(at(A, 'yangRen')).toEqual(['day']));
  it('羊刃:陰干辛見申(祿前一位),不取子', () => {
    expect(at(chart('甲甲辛甲', '子申丑丑'), 'yangRen')).toEqual(['month']);
  });
  it('祿神:甲見寅 → 月支', () => expect(at(B, 'luShen')).toEqual(['month']));
  it('桃花:年支子(申子辰)見酉 → 時支', () => {
    expect(at(chart('甲甲甲甲', '子丑丑酉'), 'taoHua')).toEqual(['hour']);
  });
  it('每個命中都帶查法與典籍出處', () => {
    for (const s of findShensha(A)) expect(s.source).toMatch(/^《.+》$/);
  });
});
