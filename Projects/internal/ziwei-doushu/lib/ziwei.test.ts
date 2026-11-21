import { describe, it, expect } from 'vitest';
import { computeChart, computeHoroscope, formatMutagen } from './ziwei';
import { toContext } from './divination/systems/ziwei';

/**
 * 排盤正確性回歸錨點 (PLAN §20)。
 * 採 iztro 官方範例生辰 2000-08-16 寅時(timeIndex 2)女 國曆 → 標準輸出:
 *   命主 破軍 / 身主 文昌 / 五行局 木三局
 * 此為紫微界眾所周知的對照盤;任何排盤邏輯/重構改動後此測試必須維持綠燈,
 * 否則代表排盤被破壞。此處不啟用真太陽時以對齊 iztro 原生範例(純鐘錶時間)。
 *
 * 備註:命主與五行局隨「命宮(時辰)」變動,身主隨「出生年支」固定。
 *   例:同日 14:30(未時 index 7)→ 命主巨門/身主文昌/火六局(身主不變)。
 */
describe('computeChart — 紫微排盤回歸', () => {
  // 寅時 = 03:00–05:00 → hour 4 對應 timeIndex 2
  const result = computeChart({
    year: 2000, month: 8, day: 16, hour: 4, minute: 0,
    gender: '女', calendar: 'solar',
  });

  it('產出 12 宮', () => {
    expect(result.astrolabe.palaces).toHaveLength(12);
  });

  it('命主 / 身主 / 五行局 對齊 iztro 官方標準輸出', () => {
    expect(result.astrolabe.soul).toBe('破軍');
    expect(result.astrolabe.body).toBe('文昌');
    expect(result.astrolabe.fiveElementsClass).toBe('木三局');
  });

  it('未啟用真太陽時時不帶 correction', () => {
    expect(result.correction).toBeUndefined();
  });

  it('寅時 04:00 → timeIndex 2', () => {
    expect(result.timeIndex).toBe(2);
  });
});

describe('computeChart — 農曆輸入', () => {
  const palaces = (r: ReturnType<typeof computeChart>) => JSON.stringify(r.astrolabe.palaces);
  const birth = { hour: 10, minute: 20, gender: '女' as const };
  const trueSolar = { longitude: 121.5, tzOffsetHours: 8 };
  // [農曆年, 月, 日, 閏月?, 對應國曆年, 月, 日]
  const cases = [
    [1990, 2, 30, false, 1990, 3, 26], // 國曆沒有 2/30
    [1990, 5, 15, true, 1990, 7, 7], // 閏五月
    [1996, 1, 1, false, 1996, 2, 19],
  ] as const;

  it.each(cases)('農曆 %i-%i-%i 與同一天的國曆排出同一張盤(含真太陽時)', (ly, lm, ld, leap, sy, sm, sd) => {
    for (const ts of [undefined, trueSolar]) {
      const lunar = computeChart({ ...birth, year: ly, month: lm, day: ld, calendar: 'lunar', isLeapMonth: leap, trueSolar: ts });
      const solar = computeChart({ ...birth, year: sy, month: sm, day: sd, calendar: 'solar', trueSolar: ts });
      expect(palaces(lunar)).toBe(palaces(solar));
      expect(lunar.correction).toEqual(solar.correction);
    }
  });

  it('不存在的農曆日期拋錯,不靜默改排別天', () => {
    expect(() =>
      computeChart({ ...birth, year: 1990, month: 5, day: 15, calendar: 'lunar', isLeapMonth: false, trueSolar })
        && computeChart({ ...birth, year: 1991, month: 5, day: 15, calendar: 'lunar', isLeapMonth: true }),
    ).toThrow();
  });
});

describe('computeHoroscope — 過運四化', () => {
  const result = computeChart({
    year: 2000, month: 8, day: 16, hour: 4, minute: 0,
    gender: '女', calendar: 'solar',
  });

  it('流年四化只取決於流年天干:2026 = 丙年 → 同機昌廉', () => {
    const h = computeHoroscope(result.astrolabe, '2026-06-26');
    expect(h.yearly.heavenlyStem).toBe('丙');
    // 丙干四化:天同(祿)天機(權)文昌(科)廉貞(忌)
    expect(h.yearly.mutagenStars).toEqual(['天同', '天機', '文昌', '廉貞']);
    expect(h.date).toBe('2026-06-26');
  });

  it('五個運限層皆有四化飛星', () => {
    const h = computeHoroscope(result.astrolabe, '2026-06-26');
    for (const scope of [h.decadal, h.yearly, h.monthly, h.daily, h.hourly]) {
      expect(scope.mutagenStars.length).toBe(4);
    }
  });

  it('傳入 timeIndex 時 hourly 為確定(同輸入必同輸出)', () => {
    const a = computeHoroscope(result.astrolabe, '2026-06-26', 2);
    const b = computeHoroscope(result.astrolabe, '2026-06-26', 2);
    expect(a.hourly.mutagenStars).toEqual(b.hourly.mutagenStars);
    expect(a.hourly.heavenlyStem).toBe(b.hourly.heavenlyStem);
  });
});

describe('formatMutagen', () => {
  it('依序組成「X化祿、X化權…」', () => {
    expect(formatMutagen(['天同', '天機', '文昌', '廉貞'])).toBe(
      '天同化祿、天機化權、文昌化科、廉貞化忌',
    );
  });
});

describe('紫微 toContext 強化(廟旺 + 四化 + 過運)', () => {
  const result = computeChart({
    year: 2000, month: 8, day: 16, hour: 4, minute: 0,
    gender: '女', calendar: 'solar',
  });

  it('各宮主星 fact 帶廟旺括號', () => {
    const ctx = toContext(result, 'zh-TW');
    const ming = ctx.facts.find((f) => f.label === 'palace:命宮');
    expect(ming?.value).toMatch(/[（(].+[)）]/); // 含廟旺括號
  });

  it('傳入 horoscope 時加入大限 / 流年 facts', () => {
    const h = computeHoroscope(result.astrolabe, '2026-06-26');
    const ctx = toContext(result, 'zh-TW', h);
    expect(ctx.facts.find((f) => f.label === 'yearly')?.value).toContain('丙年');
    expect(ctx.facts.some((f) => f.label === 'decadal')).toBe(true);
  });

  it('不傳 horoscope 時不含過運 facts(compute 預設不帶,維持確定性)', () => {
    const ctx = toContext(result, 'zh-TW');
    expect(ctx.facts.some((f) => f.label === 'yearly')).toBe(false);
  });
});

describe('晚子時日界(ZIWEI_DAY_DIVIDE=current:23 點仍屬當日)', () => {
  const chartOf = (y: number, m: number, d: number, hour: number) =>
    computeChart({ year: y, month: m, day: d, hour, minute: 30, gender: '女', calendar: 'solar' }).astrolabe;
  const view = (a: ReturnType<typeof chartOf>) => ({
    lunarDate: a.lunarDate, chineseDate: a.chineseDate, soul: a.soul, body: a.body,
    five: a.fiveElementsClass, zodiac: a.zodiac, palaces: JSON.stringify(a.palaces),
  });
  // iztro late-rat-hour.test.ts 矩陣節選:[23 點那天, 次日]
  const rows = [
    ['月中', [2000, 8, 16], [2000, 8, 17]],
    ['農曆小月末', [1996, 8, 13], [1996, 8, 14]],
    ['除夕', [2020, 1, 24], [2020, 1, 25]],
    ['閏月十五', [2023, 4, 5], [2023, 4, 6]],
  ] as const;

  // 上游預設是換到次日;兩個方向都鎖,設定沒接上這組就會紅。
  it.each(rows)('%s:23 點的盤 = 當日 0 點的盤,≠ 次日 0 點的盤', (_n, [y, m, d], [ny, nm, nd]) => {
    const late = view(chartOf(y, m, d, 23));
    expect(late).toEqual(view(chartOf(y, m, d, 0)));
    expect(late).not.toEqual(view(chartOf(ny, nm, nd, 0)));
  });
});

describe('iztro 2.6.5 輸入驗證與英文盤', () => {
  it('不存在的國曆日期拋錯,不靜默回捲', () => {
    expect(() =>
      computeChart({ year: 2023, month: 2, day: 30, hour: 10, minute: 0, gender: '女', calendar: 'solar' }),
    ).toThrow();
  });

  it('en 盤:頁面用到的欄位皆有值,農曆日期為英文格式', () => {
    const a = computeChart({
      year: 2023, month: 12, day: 31, hour: 14, minute: 30, gender: '女', calendar: 'solar', locale: 'en',
    }).astrolabe;
    for (const v of [a.solarDate, a.lunarDate, a.chineseDate, a.time, a.zodiac, a.sign, a.soul, a.body, a.fiveElementsClass]) {
      expect(String(v ?? '')).not.toBe('');
    }
    expect(a.lunarDate).toBe('Lunar 2023-11-19');
    expect(a.soul).toBe('warrior'); // 武曲,2.6.1 起不再與將軍同譯 general
    for (const p of a.palaces) {
      expect(p.name).not.toBe('');
      for (const s of [...p.majorStars, ...p.minorStars, ...p.adjectiveStars]) expect(s.name).not.toBe('');
    }
  });
});
