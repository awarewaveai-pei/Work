import { describe, expect, it } from 'vitest';
import { computeZeri } from './zeri';

// 2026-11 嫁娶,lunar-javascript 原始輸出手核:
//   11-06 甲申 开 金匮黄道 冲寅,宜含嫁娶、忌無嫁娶 → good
//   11-02 庚辰 破 青龙黄道 冲戌,忌含嫁娶 → avoid
//   11-01 己卯 执 勾陈黑道,宜含嫁娶但黑道 → ok
const nov = { activity: 'jiaQu' as const, from: { year: 2026, month: 11, day: 1 }, to: { year: 2026, month: 11, day: 30 } };
const day = (r: ReturnType<typeof computeZeri>, date: string) => r.days.find((d) => d.date === date)!;

describe('computeZeri', () => {
  it('good / avoid / ok 各一個手核日', () => {
    const r = computeZeri(nov);
    expect(r.days).toHaveLength(30);
    expect(day(r, '2026-11-06')).toMatchObject({
      ganZhi: '甲申', zhiXing: '開', tianShen: { name: '金匱', huangDao: true },
      chong: { zhi: '寅', shengXiao: '虎' }, yi: true, ji: false, verdict: 'good',
    });
    expect(day(r, '2026-11-02')).toMatchObject({ verdict: 'avoid', ji: true });
    expect(day(r, '2026-11-02').reasons).toContain('jiHit');
    expect(day(r, '2026-11-01')).toMatchObject({ verdict: 'ok', yi: true, ji: false });
    expect(day(r, '2026-11-01').reasons).toContain('heiDao');
  });

  it('birthYear 的生肖被日沖 → avoid', () => {
    // 2022 = 壬寅年(虎);11-06 沖寅
    const r = computeZeri({ ...nov, birthYear: 2022 });
    expect(r.resident).toEqual({ zhi: '寅', shengXiao: '虎' });
    expect(day(r, '2026-11-06')).toMatchObject({ verdict: 'avoid' });
    expect(day(r, '2026-11-06').reasons).toContain('chongResident');
  });

  it('區間超過 92 天拋錯', () => {
    expect(() => computeZeri({ ...nov, to: { year: 2027, month: 2, day: 1 } })).toThrow();
    expect(() => computeZeri({ ...nov, to: { year: 2027, month: 1, day: 31 } })).not.toThrow(); // 92 天
  });
});
