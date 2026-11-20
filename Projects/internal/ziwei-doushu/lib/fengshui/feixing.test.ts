import { describe, expect, it } from 'vitest';
import { computeFeixing, degreeToMountain } from './feixing';

/**
 * 標準盤依《沈氏玄空學》挨星法手排(運盤順飛;山向星取運盤坐/向宮星數,
 *   依同元山陰陽定順逆)。八運子山午向為公認「雙星到向」盤。
 * 陣列依洛書宮 1..9:[坎, 坤, 震, 巽, 中, 乾, 兌, 艮, 離]。
 */
const plate = (r: ReturnType<typeof computeFeixing>, k: 'period' | 'mountain' | 'facing') =>
  r.palaces.map((p) => p[k]);

describe('玄空飛星 標準盤', () => {
  it('八運 子山午向(雙星到向)', () => {
    const r = computeFeixing({ facingDegree: 180, moveIn: { year: 2010, month: 6, day: 1 }, flowYear: 2026 });
    expect(r.sitting.mountain).toBe('子');
    expect(r.facing.mountain).toBe('午');
    expect(r.period).toBe(8);
    expect(plate(r, 'period')).toEqual([4, 5, 6, 7, 8, 9, 1, 2, 3]);
    expect(plate(r, 'mountain')).toEqual([9, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(plate(r, 'facing')).toEqual([7, 6, 5, 4, 3, 2, 1, 9, 8]);
    expect(r.pattern).toBe('shuangXingDaoXiang');
  });

  it('九運 壬山丙向', () => {
    const r = computeFeixing({ facingDegree: 165, moveIn: { year: 2025, month: 6, day: 1 }, flowYear: 2026 });
    expect(r.sitting.mountain).toBe('壬');
    expect(r.facing.mountain).toBe('丙');
    expect(r.period).toBe(9);
    expect(plate(r, 'period')).toEqual([5, 6, 7, 8, 9, 1, 2, 3, 4]);
    // 坐宮運星 5 入中,依壬(陽)順飛;向宮運星 4,同元山辰(陰)逆飛
    expect(plate(r, 'mountain')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(plate(r, 'facing')).toEqual([8, 7, 6, 5, 4, 3, 2, 1, 9]);
    expect(r.pattern).toBe('shuangXingDaoXiang');
  });

  it('兼向:午向偏 6° 兼丁 → 替卦(替星訣:巽武曲 6、卯巨門 2)', () => {
    expect(degreeToMountain(180).jian).toBeNull();
    const r = computeFeixing({ facingDegree: 186, moveIn: { year: 2010, month: 6, day: 1 }, flowYear: 2026 });
    expect(r.facing.jian).toBe('丁');
    expect(r.replaced).toBe(true);
    expect(plate(r, 'mountain')).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 1]);
    expect(plate(r, 'facing')).toEqual([6, 5, 4, 3, 2, 1, 9, 8, 7]);
  });

  it('立春前一天歸前一年(2024 立春 2/4)', () => {
    const before = computeFeixing({ facingDegree: 180, moveIn: { year: 2024, month: 2, day: 3 }, flowYear: 2026 });
    const after = computeFeixing({ facingDegree: 180, moveIn: { year: 2024, month: 2, day: 4 }, flowYear: 2026 });
    expect(before.moveInYear).toBe(2023);
    expect(before.period).toBe(8);
    expect(after.period).toBe(9);
  });

  it('流年紫白:2026 一白入中', () => {
    const r = computeFeixing({ facingDegree: 180, moveIn: { year: 2010, month: 6, day: 1 }, flowYear: 2026 });
    expect(r.annualCenter).toBe(1);
  });
});
