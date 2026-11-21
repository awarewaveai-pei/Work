import { describe, it, expect } from 'vitest';
import { findReturnJd, jdToDateTime, transitAspects, RETURN_TOLERANCE_DEG } from './astrologyTransits';
import { computeTransits, julianDay } from './astrology';
import { transitContext, utcOffsetLabel, MAX_CONTEXT_FACTS } from './astrologyView';
import { initSync, XalenWasm } from '@xalen/wasm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('transitAspects — 容許度一律 3°、日月不加寬、本命不動', () => {
  it('2.9° 成立、3.1° 不成立', () => {
    expect(transitAspects([{ body: 'mars', longitude: 92.9, speed: 0.5 }], [{ body: 'venus', longitude: 0 }])).toHaveLength(1);
    expect(transitAspects([{ body: 'mars', longitude: 93.1, speed: 0.5 }], [{ body: 'venus', longitude: 0 }])).toHaveLength(0);
  });

  it('太陽參與也不加寬:3.5° 合相不成立', () => {
    expect(transitAspects([{ body: 'sun', longitude: 3.5, speed: 1 }], [{ body: 'moon', longitude: 0 }])).toHaveLength(0);
  });

  it('入相/出相看行運星速度,本命星即使給了速度也視為 0', () => {
    // 行運火星在本命金星後 2°、順行 → 靠近合相 = 入相;本命金星速度 50 被忽略
    const [a] = transitAspects([{ body: 'mars', longitude: 358, speed: 0.5 }], [{ body: 'venus', longitude: 0, speed: 50 }]);
    expect(a).toMatchObject({ a: 'mars', b: 'venus', aspect: 'conjunction', applying: true });
    // 逆行離開 = 出相
    expect(transitAspects([{ body: 'mars', longitude: 358, speed: -0.5 }], [{ body: 'venus', longitude: 0 }])[0].applying).toBe(false);
  });

  it('同名星體各自獨立:行運太陽合本命太陽', () => {
    expect(transitAspects([{ body: 'sun', longitude: 10.5, speed: 1 }], [{ body: 'sun', longitude: 10 }])[0]).toMatchObject({ a: 'sun', b: 'sun', aspect: 'conjunction' });
  });
});

describe('findReturnJd', () => {
  it('合成星曆(每天 0.9856°,跨 360°)解到門檻內', () => {
    const lonAt = (jd: number) => (((100 + (jd - 2451545) * 0.9856) % 360) + 360) % 360;
    const jd = findReturnJd(lonAt, 5, 2451545 + 270);
    const d = Math.abs(((lonAt(jd) - 5 + 540) % 360) - 180);
    expect(d).toBeLessThanOrEqual(RETURN_TOLERANCE_DEG);
  });

  it('XALEN 真實太陽:J2000 出生的 2026 年回歸誤差 < 1 角秒、落在 1 月 1 日前後一天內', () => {
    initSync({ module: readFileSync(join(process.cwd(), 'node_modules/@xalen/wasm/xalen_wasm_bg.wasm')) });
    const w = new XalenWasm();
    const natalSun = w.tropicalLongitude(2451545.0, 0);
    const jd = findReturnJd((t) => w.tropicalLongitude(t, 0), natalSun, julianDay(2026, 1, 1, 12));
    const err = Math.abs(((w.tropicalLongitude(jd, 0) - natalSun + 540) % 360) - 180);
    expect(err * 3600).toBeLessThan(1);
    expect(Math.abs(jd - julianDay(2026, 1, 1, 12))).toBeLessThan(1);
  });
});

describe('utcOffsetLabel', () => {
  it('整點、半點、45 分、負時區', () => {
    expect(utcOffsetLabel(8)).toBe('UTC+08:00');
    expect(utcOffsetLabel(5.75)).toBe('UTC+05:45');
    expect(utcOffsetLabel(-3.5)).toBe('UTC-03:30');
    expect(utcOffsetLabel(-0)).toBe('UTC+00:00');
  });
});

describe('jdToDateTime', () => {
  it('J2000.0 = 2000-01-01 12:00 UT;UTC+8 為 20:00', () => {
    expect(jdToDateTime(2451545.0, 0)).toEqual({ year: 2000, month: 1, day: 1, hour: 12, minute: 0 });
    expect(jdToDateTime(2451545.0, 8)).toEqual({ year: 2000, month: 1, day: 1, hour: 20, minute: 0 });
  });
});

describe('computeTransits + transitContext', () => {
  const t = computeTransits(
    { year: 2000, month: 1, day: 1, hour: 12, minute: 0, tzOffsetHours: 0, lat: 51.48, lon: 0 },
    { year: 2026, month: 11, day: 21 },
    8,
  );

  it('行運時刻 = 今天當地正午;十二星體;相位都在 3° 內且由小到大', () => {
    expect(t.jd).toBeCloseTo(julianDay(2026, 11, 21, 4), 9);
    expect(t.planets).toHaveLength(12);
    for (let i = 0; i < t.aspects.length; i++) {
      expect(t.aspects[i].orb).toBeLessThanOrEqual(3);
      if (i > 0) expect(t.aspects[i].orb).toBeGreaterThanOrEqual(t.aspects[i - 1].orb);
    }
    // J2000 出生,行運日 2026-11-21:最近一次回歸在 2026 年 1 月 1 日前後,且不晚於行運時刻
    expect(t.solarReturn.jd).toBeLessThanOrEqual(t.jd);
    expect(Math.abs(t.solarReturn.jd - julianDay(2026, 1, 1, 12))).toBeLessThan(1);
  });

  it('context 獨立且不超過 interpret route 上限', () => {
    for (const locale of ['zh-TW', 'en'] as const) {
      const ctx = transitContext(t, locale);
      expect(ctx.facts.length).toBeLessThanOrEqual(MAX_CONTEXT_FACTS);
      for (const f of ctx.facts) {
        expect(f.label.length).toBeLessThanOrEqual(60);
        expect(f.value.length).toBeLessThanOrEqual(300);
      }
    }
  });
});
