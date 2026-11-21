import { describe, it, expect } from 'vitest';
import { computeWesternChart, type BodyKey } from './astrology';
import ref from './fixtures/jpl-horizons-geocentric.json';

/**
 * 外部基準:JPL Horizons 地心視黃經(黃道 of-date,含光行時、光偏折、光行差)。
 * 查詢參數與取得日期在 fixture 內;本檔不改引擎,只量差距。
 */
const TOLERANCE: Partial<Record<BodyKey, number>> = { moon: 0.02 };
const DEFAULT_TOLERANCE = 0.01;

/** 兩黃經的最短角距(度) */
const angDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

describe('西洋占星 vs JPL Horizons(10 個時刻 × 10 星體)', () => {
  ref.times.forEach((t, i) => {
    it(`${t.utc} UT`, () => {
      const h = Math.floor(t.hourUT);
      const chart = computeWesternChart({
        year: t.year,
        month: t.month,
        day: t.day,
        hour: h,
        minute: (t.hourUT - h) * 60,
        tzOffsetHours: 0,
        lat: 25,
        lon: 121.5,
      });
      expect(chart.jd).toBeCloseTo(t.jdUT, 6);
      for (const [body, values] of Object.entries(ref.longitude) as [BodyKey, number[]][]) {
        const ours = chart.planets.find((p) => p.body === body)!.longitude;
        const diff = angDiff(ours, values[i]);
        expect(diff, `${body}: 本站 ${ours.toFixed(5)} vs JPL ${values[i]}`).toBeLessThan(
          TOLERANCE[body] ?? DEFAULT_TOLERANCE,
        );
      }
    });
  });
});
