import { describe, it, expect } from 'vitest';
import {
  YEAR_DAYS,
  dateAfterBirth,
  decennialAt,
  elapsedDays,
  firdariaAt,
  releasingAt,
} from './astrologyTimeLords';
import { arabicPart, sunRelation, techniquesReading, type PartsInput } from './astrologyTraditional';
import { computeWesternChart } from './astrology';
import { techniquesContext, MAX_CONTEXT_FACTS } from './astrologyView';

const Y = YEAR_DAYS;
const M = YEAR_DAYS / 12;

describe('法達(年長 365.2425 天)', () => {
  it('日盤:0 歲 日/日;10.5 歲 金/金;12 歲 金/水(金星大運 8 年 ÷ 7 = 1.143 年一段)', () => {
    expect(firdariaAt(true, 0)).toMatchObject({ major: { ruler: 'sun', start: 0, end: 10 * Y }, sub: { ruler: 'sun' } });
    expect(firdariaAt(true, 10.5 * Y)).toMatchObject({ major: { ruler: 'venus' }, sub: { ruler: 'venus' } });
    expect(firdariaAt(true, 12 * Y)).toMatchObject({ major: { ruler: 'venus' }, sub: { ruler: 'mercury' } });
  });

  it('夜盤:72 歲北交點(70–73)不細分;74 歲南交點;76 歲進入第二輪月亮', () => {
    const n = firdariaAt(false, 72 * Y)!;
    expect(n).toMatchObject({ major: { ruler: 'northNode' }, sub: null });
    expect(n.major.start).toBeCloseTo(70 * Y, 6);
    expect(n.major.end).toBeCloseTo(73 * Y, 6);
    expect(firdariaAt(false, 74 * Y)?.major.ruler).toBe('southNode');
    expect(firdariaAt(false, 76 * Y)).toMatchObject({ major: { ruler: 'moon', start: 75 * Y }, sub: { ruler: 'moon' } });
  });

  it('出生前 → null', () => {
    expect(firdariaAt(true, -1)).toBeNull();
  });
});

describe('黃道釋放', () => {
  it('福點牡羊:20 歲 第一層金牛(15–23 歲,續宮)、第二層獅子(第 53–72 個月)', () => {
    const z = releasingAt(0, 0, 20 * Y)!;
    expect(z.l1).toMatchObject({ signIndex: 1, angularity: 'succedent', loosing: false });
    expect(z.l1.start).toBeCloseTo(15 * Y, 6);
    expect(z.l2.signIndex).toBe(4);
    expect(z.l2.start).toBeCloseTo(15 * Y + 53 * M, 6);
  });

  it('解除束縛:水瓶 30 年的第二層走完 12 個星座(211 個月)後跳到對宮獅子', () => {
    const z = releasingAt(10, 10, 211.5 * M)!;
    expect(z.l1.signIndex).toBe(10);
    expect(z.l2).toMatchObject({ signIndex: 4, loosing: true });
    expect(z.l2.start).toBeCloseTo(211 * M, 6);
  });

  it('巔峰期依福點星座:精神點線的金牛在福點金牛時為角宮', () => {
    expect(releasingAt(1, 1, 0)!.l1.angularity).toBe('angular');
  });
});

describe('十年期', () => {
  it('土星起:0 歲 土/土;3 歲 土/木(第 30–42 個月);11 歲 進入木星主段、木/木', () => {
    expect(decennialAt('saturn', 0)).toMatchObject({ major: { ruler: 'saturn' }, sub: { ruler: 'saturn' } });
    const d3 = decennialAt('saturn', 3 * Y)!;
    expect(d3.sub.ruler).toBe('jupiter');
    expect(d3.sub.start).toBeCloseTo(30 * M, 6);
    const d11 = decennialAt('saturn', 11 * Y)!;
    expect(d11.major.ruler).toBe('jupiter');
    expect(d11.major.start).toBeCloseTo(129 * M, 6);
    expect(d11.sub.ruler).toBe('jupiter');
  });
});

describe('其餘阿拉伯點(點 = C + B − A)', () => {
  const base: PartsInput = {
    diurnal: true,
    asc: 0,
    cusps: [0, 35, 60, 90, 120, 150, 180, 215, 240, 270, 300, 330],
    planets: { sun: 280, moon: 100, mercury: 270, venus: 50, mars: 200, jupiter: 30, saturn: 10 },
    fortune: 180,
    spirit: 20,
  };
  it('婚姻點(男)日夜同式:上升 + 金 − 土 = 40°', () => {
    expect(arabicPart('weddingMale', base)).toBeCloseTo(40, 9);
    expect(arabicPart('weddingMale', { ...base, diurnal: false })).toBeCloseTo(40, 9);
  });
  it('子女點:日盤 上升 + 土 − 木 = 340°;夜盤 上升 + 木 − 土 = 20°', () => {
    expect(arabicPart('sons', base)).toBeCloseTo(340, 9);
    expect(arabicPart('sons', { ...base, diurnal: false })).toBeCloseTo(20, 9);
  });
  it('死亡點:土 + 第 8 宮頭 − 月 = 125°;財物點:上升 + 第 2 宮頭 − 第 2 宮主(金牛→金星) = 345°', () => {
    expect(arabicPart('death', base)).toBeCloseTo(125, 9);
    expect(arabicPart('substance', base)).toBeCloseTo(345, 9);
  });
});

describe('與太陽距離分級', () => {
  it('0.2° 日核、0.3° 燃燒、7.9° 燃燒、8° 光束下、15.9° 光束下、16° 不算;跨 0° 取最短弧', () => {
    expect(sunRelation(100.2, 100)).toBe('cazimi');
    expect(sunRelation(100.3, 100)).toBe('combust');
    expect(sunRelation(92.1, 100)).toBe('combust');
    expect(sunRelation(108, 100)).toBe('underBeams');
    expect(sunRelation(115.9, 100)).toBe('underBeams');
    expect(sunRelation(116, 100)).toBeNull();
    expect(sunRelation(1, 359)).toBe('combust');
  });
});

describe('日期換算與 J2000 盤彙整', () => {
  it('出生 + 10 個 365.2425 天 = 2009-12-31 晚上(2000–2009 有 3 個閏日,曆年 3653 天);今天正午減出生正午', () => {
    const birth = { year: 2000, month: 1, day: 1, hour: 12, minute: 0 };
    expect(dateAfterBirth(birth, 10 * Y)).toEqual({ year: 2009, month: 12, day: 31 });
    expect(dateAfterBirth(birth, 10 * Y + 1)).toEqual({ year: 2010, month: 1, day: 1 });
    expect(elapsedDays(birth, { year: 2000, month: 1, day: 11 })).toBe(10);
  });

  it('techniquesReading + context 不超過上限', () => {
    const req = { year: 2000, month: 1, day: 1, hour: 12, minute: 0, tzOffsetHours: 0, lat: 51.48, lon: 0 };
    const chart = computeWesternChart(req);
    const r = techniquesReading(chart, req, { year: 2026, month: 11, day: 21 })!;
    expect(r.diurnal).toBe(true);
    expect(r.parts).toHaveLength(19);
    // 26.9 歲、日盤:金星大運 10–18、水星 18–31 → 目前水星大運
    expect(r.firdaria?.major.ruler).toBe('mercury');
    for (const locale of ['zh-TW', 'en'] as const) {
      const ctx = techniquesContext(r, req, locale);
      expect(ctx.facts.length).toBeLessThanOrEqual(MAX_CONTEXT_FACTS);
      for (const f of ctx.facts) {
        expect(f.label.length).toBeLessThanOrEqual(60);
        expect(f.value.length).toBeLessThanOrEqual(300);
      }
    }
  });
});
