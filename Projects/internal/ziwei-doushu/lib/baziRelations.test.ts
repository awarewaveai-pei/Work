import { describe, it, expect } from 'vitest';
import { findBaziRelations, relationTerm, type PillarChars } from './baziRelations';

const chart = (gans: string, zhis: string): PillarChars => ({
  gan: { year: gans[0], month: gans[1], day: gans[2], hour: gans[3] },
  zhi: { year: zhis[0], month: zhis[1], day: zhis[2], hour: zhis[3] },
});
const terms = (c: PillarChars) => findBaziRelations(c).map(relationTerm);

describe('findBaziRelations — 每類一例', () => {
  it('天干五合:乙庚合金(年-時)', () => {
    const r = findBaziRelations(chart('庚甲丙乙', '辰申午未')).find((x) => x.kind === 'ganHe');
    expect(r).toMatchObject({ chars: ['庚', '乙'], positions: ['year', 'hour'], element: '金' });
    expect(relationTerm(r!)).toBe('乙庚合金');
  });
  it('地支六合:午未合(日-時)', () => {
    expect(terms(chart('庚甲丙乙', '辰申午未'))).toContain('午未合');
  });
  it('地支三合:申子辰三字全見才成局', () => {
    expect(terms(chart('甲甲甲甲', '申子辰丑'))).toContain('申子辰三合水局');
    expect(terms(chart('甲甲甲甲', '申子丑丑')).some((t) => t.includes('三合'))).toBe(false);
  });
  it('六沖:辰戌沖(日-時)', () => {
    const r = findBaziRelations(chart('甲丙甲戊', '子寅戌辰')).find((x) => x.kind === 'chong');
    expect(r).toMatchObject({ chars: ['戌', '辰'], positions: ['day', 'hour'] });
    expect(relationTerm(r!)).toBe('辰戌沖');
  });
  it('三刑:寅巳申全見、子卯相刑、午午自刑', () => {
    expect(terms(chart('甲甲甲甲', '申寅巳丑'))).toContain('寅巳申三刑');
    expect(terms(chart('甲甲甲甲', '子卯丑丑'))).toContain('子卯相刑');
    expect(terms(chart('甲甲甲甲', '午丑午丑'))).toContain('午午自刑');
  });
  it('相害:卯辰害', () => {
    expect(terms(chart('甲甲甲甲', '卯辰丑丑'))).toContain('卯辰害');
  });
});
