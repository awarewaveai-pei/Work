import { describe, it, expect } from 'vitest';
import { computeAspects, separation } from './astrologyAspects';
import { computeWesternChart } from './astrology';
import { astrologyContext, MAX_ASPECT_FACTS } from './astrologyView';

describe('separation / computeAspects', () => {
  it('跨 0°:359° 與 1° 相距 2°,成合相', () => {
    expect(separation(359, 1)).toBeCloseTo(2, 9);
    const [a] = computeAspects([
      { body: 'mars', longitude: 359 },
      { body: 'venus', longitude: 1 },
    ]);
    expect(a.aspect).toBe('conjunction');
    expect(a.orb).toBeCloseTo(2, 9);
  });

  it('容許度邊界:刑相 6° 內成立、6.1° 不成立', () => {
    expect(computeAspects([{ body: 'mars', longitude: 0 }, { body: 'saturn', longitude: 96 }])).toHaveLength(1);
    expect(computeAspects([{ body: 'mars', longitude: 0 }, { body: 'saturn', longitude: 96.1 }])).toHaveLength(0);
  });

  it('日月加寬 1.5°,兩顆都在只加一次', () => {
    expect(computeAspects([{ body: 'sun', longitude: 0 }, { body: 'mars', longitude: 187.5 }])[0]?.aspect).toBe('opposition');
    expect(computeAspects([{ body: 'sun', longitude: 0 }, { body: 'mars', longitude: 187.6 }])).toHaveLength(0);
    expect(computeAspects([{ body: 'sun', longitude: 0 }, { body: 'moon', longitude: 187.6 }])).toHaveLength(0);
  });

  it('兩相位都成立時取偏離最近者(自訂重疊容許度)', () => {
    const wide = [
      { key: 'conjunction', angle: 0, orb: 40 },
      { key: 'sextile', angle: 60, orb: 40 },
    ] as const;
    const pts = [{ body: 'mars', longitude: 0 }, { body: 'venus', longitude: 35 }];
    expect(computeAspects(pts, wide)[0]).toMatchObject({ aspect: 'sextile', orb: 25 });
  });

  it('依偏離由小到大排序', () => {
    const res = computeAspects([
      { body: 'mars', longitude: 0 },
      { body: 'venus', longitude: 3 },
      { body: 'saturn', longitude: 121 },
    ]);
    expect(res.map((x) => x.orb)).toEqual([1, 2, 3]);
  });

  it('入相/出相依速度判斷', () => {
    // 月亮比太陽快:在太陽前 5° 時偏離變大 → 出相;在後 5°(355°)追上 → 入相
    expect(computeAspects([{ body: 'sun', longitude: 0, speed: 1 }, { body: 'moon', longitude: 5, speed: 13 }])[0].applying).toBe(false);
    expect(computeAspects([{ body: 'sun', longitude: 0, speed: 1 }, { body: 'moon', longitude: 355, speed: 13 }])[0].applying).toBe(true);
    expect(computeAspects([{ body: 'sun', longitude: 0 }, { body: 'moon', longitude: 5 }])[0].applying).toBeNull();
    // 沖相方向相反:差 179° 時拉開 = 入相;差 181°(=179° 另一側)時拉開 = 出相
    expect(computeAspects([{ body: 'mars', longitude: 10, speed: 1 }, { body: 'venus', longitude: 189, speed: 2 }])[0]).toMatchObject({ aspect: 'opposition', applying: true });
    expect(computeAspects([{ body: 'mars', longitude: 10, speed: 1 }, { body: 'venus', longitude: 191, speed: 2 }])[0]).toMatchObject({ aspect: 'opposition', applying: false });
  });
});

describe('已知生辰快照(J2000 格林威治)', () => {
  const chart = computeWesternChart({
    year: 2000, month: 1, day: 1, hour: 12, minute: 0,
    tzOffsetHours: 0, lat: 51.48, lon: 0,
  });

  it('相位數量與排序', () => {
    expect(chart.aspects.length).toMatchInlineSnapshot(`15`);
    for (let i = 1; i < chart.aspects.length; i++) {
      expect(chart.aspects[i].orb).toBeGreaterThanOrEqual(chart.aspects[i - 1].orb);
    }
  });

  it('facts 不超過 interpret route 上限', () => {
    for (const locale of ['zh-TW', 'en'] as const) {
      const ctx = astrologyContext(chart, locale);
      expect(ctx.facts.length).toBeLessThanOrEqual(60);
      expect(ctx.facts.length).toBe(14 + Math.min(chart.aspects.length, MAX_ASPECT_FACTS));
      for (const f of ctx.facts) {
        expect(f.label.length).toBeLessThanOrEqual(60);
        expect(f.value.length).toBeLessThanOrEqual(300);
      }
    }
  });
});
