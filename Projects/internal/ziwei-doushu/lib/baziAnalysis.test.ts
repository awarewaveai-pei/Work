import { describe, it, expect } from 'vitest';
import { analyzeBazi } from './baziAnalysis';

/**
 * 扶抑取用神回歸錨點:庚辰 / 甲申 / 丙午 / 乙未(丙日主,申月失令)。
 *   十神(對丙):天干 庚=偏財、甲=偏印、乙=正印;地支本氣 辰=食神、申=偏財、
 *   午=劫財、未=傷官。
 *   扶(印+比劫)= 甲+乙+午 = 3;抑(食傷財官)= 庚+辰+申×2+未 = 5 → 身弱 →
 *   喜印比 = 木、火;忌食傷財官 = 土、金、水;月令本氣 偏財 → 偏財格。
 */
describe('analyzeBazi — 扶抑法', () => {
  const a = analyzeBazi({
    dayGan: '丙',
    stemShiShen: ['偏財', '偏印', '正印'],
    branchPrimaryShiShen: [
      { shiShen: '食神', isMonth: false },
      { shiShen: '偏財', isMonth: true },
      { shiShen: '劫財', isMonth: false },
      { shiShen: '傷官', isMonth: false },
    ],
    monthPrimaryShiShen: '偏財',
  });

  it('日主五行 = 火', () => {
    expect(a.dayElement).toBe('火');
  });

  it('身弱(扶 3 < 抑 5)', () => {
    expect(a.supportScore).toBe(3);
    expect(a.drainScore).toBe(5);
    expect(a.strength).toBe('身弱');
  });

  it('身弱喜印比 → 喜木火、忌土金水', () => {
    expect(a.favorable.sort()).toEqual(['木', '火'].sort());
    expect(a.avoid.sort()).toEqual(['土', '金', '水'].sort());
  });

  it('月令本氣偏財 → patternShiShen 偏財', () => {
    expect(a.patternShiShen).toBe('偏財');
  });

  it('身強範例(扶 > 抑)喜抑神', () => {
    const strong = analyzeBazi({
      dayGan: '甲', // 木
      stemShiShen: ['正印', '比肩', '劫財'],
      branchPrimaryShiShen: [
        { shiShen: '正印', isMonth: false },
        { shiShen: '比肩', isMonth: true },
        { shiShen: '劫財', isMonth: false },
        { shiShen: '正印', isMonth: false },
      ],
      monthPrimaryShiShen: '比肩',
    });
    expect(strong.strength).toBe('身強');
    // 甲木:食傷=火、財=土、官殺=金
    expect(strong.favorable.sort()).toEqual(['土', '火', '金'].sort());
  });

  it('簡體十神也能分類(lunar 原始輸出)', () => {
    const a2 = analyzeBazi({
      dayGan: '丙',
      stemShiShen: ['偏财', '偏印', '正印'], // 简体
      branchPrimaryShiShen: [
        { shiShen: '食神', isMonth: false },
        { shiShen: '偏财', isMonth: true },
        { shiShen: '劫财', isMonth: false },
        { shiShen: '伤官', isMonth: false },
      ],
      monthPrimaryShiShen: '偏财',
    });
    expect(a2.strength).toBe('身弱');
  });
});
