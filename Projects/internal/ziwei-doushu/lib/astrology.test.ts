import { describe, it, expect } from 'vitest';
import {
  julianDay,
  signIndexOf,
  computeWesternChart,
} from './astrology';
import { astrologyContext, signName } from './astrologyView';

describe('julianDay', () => {
  it('2000-01-01 12:00 UT = J2000.0 = JD 2451545.0', () => {
    expect(julianDay(2000, 1, 1, 12)).toBeCloseTo(2451545.0, 5);
  });
});

describe('signIndexOf', () => {
  it('0°=牡羊(0)、280°=摩羯(9)、359°=雙魚(11)', () => {
    expect(signIndexOf(0)).toBe(0);
    expect(signIndexOf(280)).toBe(9);
    expect(signIndexOf(359)).toBe(11);
    expect(signIndexOf(-1)).toBe(11); // 環繞
  });
});

describe('computeWesternChart — XALEN(對 J2000 已知值驗證)', () => {
  // 2000-01-01 12:00 UT,Greenwich(51.48N, 0E)→ J2000.0
  const chart = computeWesternChart({
    year: 2000, month: 1, day: 1, hour: 12, minute: 0,
    tzOffsetHours: 0, lat: 51.48, lon: 0,
  });

  it('太陽在摩羯(J2000 太陽黃經 ≈ 280.37°)', () => {
    const sun = chart.planets.find((p) => p.body === 'sun')!;
    expect(sun.longitude).toBeCloseTo(280.37, 0); // ±0.5° 內
    expect(sun.signIndex).toBe(9); // 摩羯
    expect(signName(sun.signIndex, 'zh-TW')).toBe('摩羯');
  });

  it('12 顆星體 + 上升/MC + 12 宮頭', () => {
    expect(chart.planets).toHaveLength(12);
    expect(chart.houseCusps).toHaveLength(12);
    expect(chart.ascendant.signIndex).toBeGreaterThanOrEqual(0);
    expect(chart.ascendant.signIndex).toBeLessThan(12);
  });

  it('每顆星落入 1–12 宮、星座 0–11', () => {
    for (const p of chart.planets) {
      expect(p.house).toBeGreaterThanOrEqual(1);
      expect(p.house).toBeLessThanOrEqual(12);
      expect(p.signIndex).toBeGreaterThanOrEqual(0);
      expect(p.signIndex).toBeLessThan(12);
    }
  });

  it('astrologyContext → systemId=astrology + 三巨頭 headline + 行星 facts', () => {
    const ctx = astrologyContext(chart, 'zh-TW');
    expect(ctx.systemId).toBe('astrology');
    expect(ctx.headline).toContain('摩羯'); // 太陽摩羯入三巨頭
    expect(ctx.facts.find((f) => f.label === '太陽')?.value).toContain('摩羯');
    expect(ctx.facts.some((f) => f.label === '上升')).toBe(true);
  });
});
