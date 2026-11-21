import { describe, it, expect } from 'vitest';
import {
  annualProfection,
  essentialDignity,
  isDiurnal,
  lots,
  traditionalReading,
  type ClassicalPlanet,
  type DignityKey,
} from './astrologyTraditional';
import { computeWesternChart } from './astrology';
import { astrologyContext } from './astrologyView';

describe('essentialDignity — 每顆古典行星廟旺陷失勢各一例', () => {
  // [行星, 廟, 旺, 陷, 失勢](星座索引 0=牡羊…11=雙魚)
  const table: [ClassicalPlanet, number, number, number, number][] = [
    ['sun', 4, 0, 10, 6],
    ['moon', 3, 1, 9, 7],
    ['mercury', 2, 5, 8, 11],
    ['venus', 1, 11, 7, 5],
    ['mars', 0, 9, 6, 3],
    ['jupiter', 8, 3, 2, 9],
    ['saturn', 9, 6, 3, 0],
  ];
  const keys: DignityKey[] = ['domicile', 'exaltation', 'detriment', 'fall'];
  for (const [planet, ...signs] of table) {
    it(planet, () => {
      signs.forEach((sign, i) => {
        expect(essentialDignity(planet, sign).dignities).toContain(keys[i]);
      });
    });
  }

  it('水星在雙魚同時陷與失勢,計 −9;在處女廟旺同在,計 +9', () => {
    expect(essentialDignity('mercury', 11)).toEqual({ dignities: ['detriment', 'fall'], score: -9 });
    expect(essentialDignity('mercury', 5)).toEqual({ dignities: ['domicile', 'exaltation'], score: 9 });
  });

  it('無尊貴 = 空陣列、0 分', () => {
    expect(essentialDignity('sun', 2)).toEqual({ dignities: [], score: 0 });
  });
});

describe('日夜盤與福點/精神點', () => {
  it('日盤:上升 0°、日 280°(地平線上)、月 223° → 福點 303°、精神點 57°', () => {
    expect(isDiurnal(280, 0)).toBe(true);
    const r = lots(0, 280, 223, true);
    expect(r.fortune).toBeCloseTo(303, 9);
    expect(r.spirit).toBeCloseTo(57, 9);
  });

  it('夜盤:上升 0°、日 100°(地平線下)、月 223° → 福點 237°、精神點 123°', () => {
    expect(isDiurnal(100, 0)).toBe(false);
    const r = lots(0, 100, 223, false);
    expect(r.fortune).toBeCloseTo(237, 9);
    expect(r.spirit).toBeCloseTo(123, 9);
  });
});

describe('annualProfection — 上升巨蟹(3),2000-05-10 生', () => {
  const birth = { year: 2000, month: 5, day: 10 };
  it('0 歲:第 1 宮巨蟹,年主星月亮', () => {
    expect(annualProfection(3, birth, { year: 2000, month: 5, day: 10 })).toEqual({ age: 0, house: 1, signIndex: 3, lord: 'moon' });
  });
  it('12 歲:回到第 1 宮巨蟹;生日前一天仍是 11 歲第 12 宮', () => {
    expect(annualProfection(3, birth, { year: 2012, month: 5, day: 10 })).toEqual({ age: 12, house: 1, signIndex: 3, lord: 'moon' });
    expect(annualProfection(3, birth, { year: 2012, month: 5, day: 9 })).toMatchObject({ age: 11, house: 12, signIndex: 2 });
  });
  it('25 歲:第 2 宮獅子,年主星太陽', () => {
    expect(annualProfection(3, birth, { year: 2025, month: 6, day: 1 })).toEqual({ age: 25, house: 2, signIndex: 4, lord: 'sun' });
  });
  it('今天早於出生 → null', () => {
    expect(annualProfection(3, birth, { year: 1999, month: 1, day: 1 })).toBeNull();
  });
});

describe('接到本命盤與 facts(J2000 格林威治正午)', () => {
  const chart = computeWesternChart({
    year: 2000, month: 1, day: 1, hour: 12, minute: 0,
    tzOffsetHours: 0, lat: 51.48, lon: 0,
  });
  const r = traditionalReading(chart, { year: 2000, month: 1, day: 1 }, { year: 2026, month: 11, day: 21 })!;

  it('正午太陽在第 10 宮 → 日盤;七顆古典行星都有尊貴判定', () => {
    expect(r.diurnal).toBe(true);
    expect(r.dignities.map((d) => d.planet)).toEqual(['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn']);
    expect(r.profection?.age).toBe(26);
  });

  it('facts 含傳統占星 5 條,總數 ≤ 60', () => {
    for (const locale of ['zh-TW', 'en'] as const) {
      const ctx = astrologyContext(chart, locale, r);
      expect(ctx.facts.length).toBeLessThanOrEqual(60);
      expect(ctx.facts.some((f) => f.label === (locale === 'en' ? 'Annual profection' : '年小限'))).toBe(true);
      for (const f of ctx.facts) {
        expect(f.label.length).toBeLessThanOrEqual(60);
        expect(f.value.length).toBeLessThanOrEqual(300);
      }
    }
  });
});
