import { describe, it, expect } from 'vitest';
import { matchBazi, matchZodiac, yearBranchOf, type HehunChart } from './hehun';
import type { WuXing } from './ganzhi';

function pillar(ganZhi: string, naYin = '大林木') {
  return { gan: ganZhi[0], zhi: ganZhi[1], naYin };
}

function chart(
  year: string,
  day: string,
  opts: { naYin?: string; dayElement?: WuXing; favorable?: WuXing[]; avoid?: WuXing[] } = {},
): HehunChart {
  return {
    pillars: {
      year: pillar(year, opts.naYin),
      month: pillar('丙寅'),
      day: pillar(day),
      hour: pillar('戊辰'),
    },
    analysis: {
      dayElement: opts.dayElement ?? '木',
      favorable: opts.favorable ?? ['火'],
      avoid: opts.avoid ?? ['金'],
    },
  };
}

const find = (m: ReturnType<typeof matchBazi>, key: string) => m.items.find((i) => i.key === key)!;

describe('合婚', () => {
  it('年支六合(子丑)→ 合', () => {
    const it0 = matchZodiac('子', '丑').items[0];
    expect(it0.basis.relations).toEqual(['liuHe']);
    expect(it0.verdict).toBe('合');
  });

  it('年支六沖(子午)→ 沖', () => {
    const it0 = matchZodiac('子', '午').items[0];
    expect(it0.basis.relations).toContain('liuChong');
    expect(it0.verdict).toBe('沖');
  });

  it('日干五合(甲己)→ 合', () => {
    const m = matchBazi(chart('甲子', '甲寅'), chart('乙丑', '己卯'));
    expect(find(m, 'dayStem')).toMatchObject({ verdict: '合', basis: { relations: ['wuHe'] } });
  });

  it('年柱納音相生(海中金 生 澗下水)→ 合', () => {
    const m = matchBazi(chart('甲子', '甲寅', { naYin: '海中金' }), chart('丙子', '丁卯', { naYin: '涧下水' }));
    expect(find(m, 'yearNaYin')).toMatchObject({
      verdict: '合',
      basis: { a: '金', b: '水', relations: ['aShengB'] },
    });
  });

  it('立春前出生的生肖歸前一年(2021 立春 2/3,春節 2/12)', () => {
    expect(yearBranchOf(2021, 2, 1)).toBe('子'); // 庚子鼠
    expect(yearBranchOf(2021, 2, 5)).toBe('丑'); // 辛丑牛(春節前,仍以立春換年)
  });
});
