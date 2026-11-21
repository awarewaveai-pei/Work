import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initSync, XalenWasm } from '@xalen/wasm';
import { computeSiderealPositions } from './astrology';
import { vedicContext } from './divination/systems/vedic';
import {
  DASHA_YEARS,
  SIDEREAL_YEAR_DAYS,
  buildVedicChart,
  jdToYmd,
  karanaName,
  nakshatraOf,
  navamsaSign,
  panchangOf,
  vimshottari,
  ymdToJd,
} from './vedic';

initSync({ module: readFileSync(join(process.cwd(), 'node_modules/@xalen/wasm/xalen_wasm_bg.wasm')) });
const w = new XalenWasm();
/** XALEN rashi 名稱("Mesha (Aries)")→ 0 = 牡羊 */
const RASHI = ['Mesha', 'Vrishabha', 'Mithuna', 'Karka', 'Simha', 'Kanya', 'Tula', 'Vrishchika', 'Dhanu', 'Makara', 'Kumbha', 'Meena'];
const rashiIndex = (s: string) => RASHI.indexOf(s.split(' ')[0]);
/** 避開分界的取樣點 */
const SAMPLES = Array.from({ length: 360 }, (_, i) => i + 0.37);

describe('月宿與九分盤', () => {
  it('邊界:0° Ashvini 第1足宿主計都;359.9° Revati 第4足宿主水星', () => {
    expect(nakshatraOf(0)).toMatchObject({ index: 0, pada: 1, lord: 'ketu' });
    expect(nakshatraOf(359.9)).toMatchObject({ index: 26, pada: 4, lord: 'mercury' });
    expect(nakshatraOf(13.34)).toMatchObject({ index: 1, pada: 1, lord: 'venus' });
  });
  it('月宿序與足和 XALEN nakshatraInfoJson 一致', () => {
    for (const L of SAMPLES) {
      const x = JSON.parse(w.nakshatraInfoJson(L)) as { index: number; pada: number };
      const n = nakshatraOf(L);
      expect([L, n.index, n.pada]).toEqual([L, x.index, x.pada]);
    }
  });
  it('九分盤和 XALEN divisionalChart(·, 9) 一致', () => {
    for (const L of SAMPLES) expect([L, navamsaSign(L)]).toEqual([L, rashiIndex(XalenWasm.divisionalChart(L, 9))]);
  });
});

describe('Vimśottarī', () => {
  const Y = SIDEREAL_YEAR_DAYS;
  it('月亮在 0°:計都 7 年從出生起整段,九運合計 120 年', () => {
    const d = vimshottari(0, 0);
    expect(d.map((m) => m.lord)).toEqual(['ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury']);
    expect(d[0].endJd).toBeCloseTo(7 * Y, 6);
    expect(d[8].endJd).toBeCloseTo(120 * Y, 6);
    expect(Object.values(DASHA_YEARS).reduce((a, b) => a + b)).toBe(120);
  });
  it('月亮在 Ashvini 正中:計都運剩 3.5 年,出生時正走計都/羅睺小運,剩 0.4667 年', () => {
    const [ketu, venus] = vimshottari(360 / 54, 0);
    expect(ketu.endJd).toBeCloseTo(3.5 * Y, 6);
    expect(ketu.antardashas.map((a) => a.lord)).toEqual(['rahu', 'jupiter', 'saturn', 'mercury']);
    expect(ketu.antardashas[0].startJd).toBe(0);
    // 計都運小運累計:7×(7+20+6+10+7+18)/120 = 3.9667 年;減去已走 3.5 年
    expect(ketu.antardashas[0].endJd / Y).toBeCloseTo(3.9667 - 3.5, 3);
    expect(venus.antardashas[0]).toMatchObject({ lord: 'venus' });
    expect(venus.antardashas[0].endJd - venus.startJd).toBeCloseTo(((20 * 20) / 120) * Y, 6);
  });
});

describe('五支', () => {
  // 1990-06-15 12:30(UTC+8)的恆星黃經:太陽 60.1039、月亮 317.4726(XALEN Lahiri)
  const jd = XalenWasm.julianDay(1990, 6, 15, 4.5);
  const p = panchangOf(60.10392596311671, 317.4725862741513, { year: 1990, month: 6, day: 15 });
  it('手算:tithi 22(黑分初七)、yoga 2、karana 43 = Vishti、星期五', () => {
    expect(p).toMatchObject({ tithi: 22, yoga: 2, karana: 43, nakshatra: 23, vara: 5 });
    expect(karanaName(43, 'en')).toBe('Vishti (43/60)');
    expect([1, 2, 58, 60].map((k) => karanaName(k, 'en').split(' ')[0])).toEqual(['Kimstughna', 'Bava', 'Shakuni', 'Naga']);
    expect(karanaName(43, 'zh-TW')).toBe('Vishti(活動半太陰日,第 43/60)');
  });
  it('tithi、yoga、karana 序和 XALEN panchangJson 一致', () => {
    const x = JSON.parse(w.panchangJson(jd, 0)) as { tithi: { number: number }; yoga: { number: number }; karana: { number: number } };
    expect([p.tithi, p.yoga, p.karana]).toEqual([x.tithi.number, x.yoga.number, x.karana.number]);
  });
});

describe('日期換算', () => {
  it('JD 2451544.9 = 2000-01-01 09:36 UT:UTC+8 是當天傍晚,UTC−10 還是前一天晚上', () => {
    expect(jdToYmd(2451545.0)).toEqual({ year: 2000, month: 1, day: 1 });
    expect(jdToYmd(2451544.9, 8)).toEqual({ year: 2000, month: 1, day: 1 });
    expect(jdToYmd(2451544.9, -10)).toEqual({ year: 1999, month: 12, day: 31 });
  });
  it('當地日期 00:00 的 JD 換回同一天', () => {
    for (const d of [{ year: 1990, month: 6, day: 15 }, { year: 2026, month: 2, day: 28 }, { year: 1900, month: 3, day: 1 }]) {
      expect(jdToYmd(ymdToJd(d, 8) + 0.01, 8)).toEqual(d);
    }
  });
});

describe('整盤(XALEN)', () => {
  const req = { year: 1990, month: 6, day: 15, hour: 12, minute: 30, tzOffsetHours: 8, lat: 25.03, lon: 121.56 };
  const raw = computeSiderealPositions(req);
  const chart = buildVedicChart(raw, 8);
  it('上升 = 回歸上升 − ayanamsa(XALEN fullChartJson 的 ascendant_deg 是回歸值)', () => {
    const fc = JSON.parse(w.fullChartJson(raw.jd, req.lat, req.lon, 0)) as { ascendant_deg: number; ayanamsa_deg: number };
    expect(raw.ascendant).toBeCloseTo(fc.ascendant_deg - fc.ayanamsa_deg, 6);
    expect(chart.ascendant.sign).toBe(5); // 處女
  });
  it('九曜與 fullChartJson 恆星黃經一致;計都 = 羅睺 + 180°;整宮制宮位', () => {
    const fc = JSON.parse(w.fullChartJson(raw.jd, req.lat, req.lon, 0)) as { planets: Record<string, { longitude: number }> };
    const lon = (k: string) => chart.grahas.find((g) => g.key === k)!;
    expect(lon('moon').longitude).toBeCloseTo(fc.planets.Moon.longitude, 6);
    expect(lon('saturn').longitude).toBeCloseTo(fc.planets.Saturn.longitude, 6);
    expect((lon('ketu').longitude - lon('rahu').longitude + 360) % 360).toBeCloseTo(180, 6);
    expect(lon('moon')).toMatchObject({ sign: 10, house: 6 }); // 水瓶,處女上升起算第 6 宮
    expect(chart.dasha.mahadashas[0].lord).toBe('rahu'); // 月亮在危宿,宿主羅睺
  });
  it('AI 事實在 API 上限內,不另佔西洋本命 context', () => {
    for (const locale of ['zh-TW', 'en'] as const) {
      const ctx = vedicContext(chart, locale, { year: 2026, month: 11, day: 21 });
      expect(ctx.systemId).toBe('vedic');
      expect(ctx.facts.length).toBeLessThanOrEqual(60);
      expect(ctx.facts.some((f) => f.label === 'dasha.current')).toBe(true);
      for (const f of ctx.facts) {
        expect(f.label.length).toBeLessThanOrEqual(60);
        expect(f.value.length).toBeLessThanOrEqual(300);
      }
    }
  });
});
