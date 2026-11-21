import type { Locale } from './i18n/config';
import type { BodyKey, SynastryResult, TransitResult, WesternChart } from './astrology';
import type { InterpretationContext } from './divination/types';
import type { Aspect, AspectKey } from './astrologyAspects';
import type { DignityKey, Profection, TraditionalReading } from './astrologyTraditional';

/**
 * 西洋占星「顯示層」— 純函式、client/server 共用(type-only import,不拉 wasm)。
 * 星座/行星名在地化 + 把 WesternChart 轉成 AI 解讀 context。
 */
export const SIGN_NAMES: Record<Locale, string[]> = {
  'zh-TW': [
    '牡羊', '金牛', '雙子', '巨蟹', '獅子', '處女',
    '天秤', '天蠍', '射手', '摩羯', '水瓶', '雙魚',
  ],
  en: [
    'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
  ],
};

export const BODY_NAMES: Record<BodyKey, Record<Locale, string>> = {
  sun: { 'zh-TW': '太陽', en: 'Sun' },
  moon: { 'zh-TW': '月亮', en: 'Moon' },
  mercury: { 'zh-TW': '水星', en: 'Mercury' },
  venus: { 'zh-TW': '金星', en: 'Venus' },
  mars: { 'zh-TW': '火星', en: 'Mars' },
  jupiter: { 'zh-TW': '木星', en: 'Jupiter' },
  saturn: { 'zh-TW': '土星', en: 'Saturn' },
  uranus: { 'zh-TW': '天王星', en: 'Uranus' },
  neptune: { 'zh-TW': '海王星', en: 'Neptune' },
  pluto: { 'zh-TW': '冥王星', en: 'Pluto' },
  northNode: { 'zh-TW': '北交點', en: 'North Node' },
  chiron: { 'zh-TW': '凱龍星', en: 'Chiron' },
};

export const ASPECT_NAMES: Record<AspectKey, Record<Locale, string>> = {
  conjunction: { 'zh-TW': '合相', en: 'Conjunction' },
  sextile: { 'zh-TW': '六合', en: 'Sextile' },
  square: { 'zh-TW': '刑相', en: 'Square' },
  trine: { 'zh-TW': '拱相', en: 'Trine' },
  opposition: { 'zh-TW': '沖相', en: 'Opposition' },
};

/**
 * 給 AI 的相位 facts 上限:interpret route 最多 60 條,上升/天頂 2 + 星體 12 = 14,
 * 傳統占星 ≤5(traditionalFacts),相位最多取偏離最小的 40 條(chart.aspects 已依偏離排序),總數 ≤ 59。
 */
export const MAX_ASPECT_FACTS = 40;

export function aspectName(aspect: AspectKey, locale: Locale): string {
  return ASPECT_NAMES[aspect][locale];
}

/** 「太陽 合相 月亮」 */
export function aspectLabel(a: Aspect<BodyKey>, locale: Locale): string {
  return `${bodyName(a.a, locale)} ${aspectName(a.aspect, locale)} ${bodyName(a.b, locale)}`;
}

/** 偏離度數(一位小數)+ 入相/出相 */
export function aspectDetail(a: Aspect<BodyKey>, locale: Locale): string {
  const orb = a.orb.toFixed(1);
  if (locale === 'en') {
    const motion = a.applying === null ? '' : a.applying ? ', applying' : ', separating';
    return `orb ${orb}°${motion}`;
  }
  const motion = a.applying === null ? '' : a.applying ? '・入相' : '・出相';
  return `偏離 ${orb}°${motion}`;
}

export const DIGNITY_NAMES: Record<DignityKey, Record<Locale, string>> = {
  domicile: { 'zh-TW': '廟', en: 'Domicile' },
  exaltation: { 'zh-TW': '旺', en: 'Exaltation' },
  detriment: { 'zh-TW': '陷', en: 'Detriment' },
  fall: { 'zh-TW': '失勢', en: 'Fall' },
};

export function sectName(diurnal: boolean, locale: Locale): string {
  if (locale === 'en') return diurnal ? 'Day chart' : 'Night chart';
  return diurnal ? '日盤' : '夜盤';
}

/** 「廟+旺 (+9)」；無尊貴回傳空字串 */
export function dignityLine(d: TraditionalReading['dignities'][number], locale: Locale): string {
  if (d.dignities.length === 0) return '';
  const names = d.dignities.map((k) => DIGNITY_NAMES[k][locale]).join(locale === 'en' ? ' + ' : '・');
  return `${names} (${d.score > 0 ? '+' : ''}${d.score})`;
}

/** 福點、精神點：「金牛 12.3°・第 5 宮」 */
export function lotLine(l: TraditionalReading['fortune'], locale: Locale): string {
  const sign = signName(l.signIndex, locale);
  if (locale === 'en') return `${sign} ${degInSign(l.longitude)}°, whole-sign house ${l.house}`;
  return `${sign} ${degInSign(l.longitude)}°・整宮第 ${l.house} 宮`;
}

export function profectionLine(p: Profection, locale: Locale): string {
  const sign = signName(p.signIndex, locale);
  const lord = bodyName(p.lord, locale);
  if (locale === 'en') return `age ${p.age}: whole-sign house ${p.house} (${sign}), lord of the year ${lord}`;
  return `${p.age} 歲:整宮第 ${p.house} 宮(${sign}座)・年主星 ${lord}`;
}

/** 傳統占星 facts,固定 ≤5 條(日夜盤、尊貴、福點、精神點、小限)。 */
export function traditionalFacts(r: TraditionalReading, locale: Locale): { label: string; value: string }[] {
  const en = locale === 'en';
  const dign = r.dignities
    .filter((d) => d.dignities.length > 0)
    .map((d) => `${bodyName(d.planet, locale)} ${dignityLine(d, locale)}`)
    .join(en ? '; ' : '、');
  const facts = [
    { label: en ? 'Sect' : '日夜盤', value: sectName(r.diurnal, locale) },
    { label: en ? 'Essential dignities' : '本質尊貴', value: dign || (en ? 'none of the seven classical planets' : '七顆古典行星皆無廟旺陷失勢') },
    { label: en ? 'Lot of Fortune' : '福點', value: lotLine(r.fortune, locale) },
    { label: en ? 'Lot of Spirit' : '精神點', value: lotLine(r.spirit, locale) },
  ];
  if (r.profection) {
    facts.push({ label: en ? 'Annual profection' : '年小限', value: profectionLine(r.profection, locale) });
  }
  return facts;
}

export function signName(signIndex: number, locale: Locale): string {
  return SIGN_NAMES[locale][signIndex] ?? '?';
}

export function bodyName(body: BodyKey, locale: Locale): string {
  return BODY_NAMES[body][locale];
}

/** 星座內度數(0–29.9) */
export function degInSign(longitude: number): number {
  return Math.floor((((longitude % 30) + 30) % 30) * 10) / 10;
}

function planetLine(
  signIndex: number,
  house: number,
  retrograde: boolean,
  locale: Locale,
): string {
  const sign = signName(signIndex, locale);
  if (locale === 'en') {
    return `${sign}, house ${house}${retrograde ? ' (R)' : ''}`;
  }
  return `${sign}座・${house}宮${retrograde ? '(逆行)' : ''}`;
}

export function astrologyContext(
  chart: WesternChart,
  locale: Locale,
  traditional: TraditionalReading | null = null,
): InterpretationContext {
  const facts: { label: string; value: string }[] = [
    {
      label: locale === 'en' ? 'Ascendant' : '上升',
      value: signName(chart.ascendant.signIndex, locale),
    },
    {
      label: 'MC',
      value: signName(chart.mc.signIndex, locale),
    },
  ];
  for (const p of chart.planets) {
    facts.push({
      label: bodyName(p.body, locale),
      value: planetLine(p.signIndex, p.house, p.retrograde, locale),
    });
  }
  if (traditional) facts.push(...traditionalFacts(traditional, locale));
  for (const a of chart.aspects.slice(0, MAX_ASPECT_FACTS)) {
    facts.push({ label: aspectLabel(a, locale), value: aspectDetail(a, locale) });
  }

  const sun = chart.planets.find((p) => p.body === 'sun');
  const moon = chart.planets.find((p) => p.body === 'moon');
  const big3 = [
    signName(chart.ascendant.signIndex, locale),
    sun ? signName(sun.signIndex, locale) : '',
    moon ? signName(moon.signIndex, locale) : '',
  ].join(locale === 'en' ? ' / ' : '・');

  return {
    systemId: 'astrology',
    locale,
    headline: big3,
    facts,
  };
}

/** = app/api/interpret/route.ts MAX_FACTS。行運、合盤各自一份 context,相位填滿剩餘名額(依偏離由小到大)。 */
export const MAX_CONTEXT_FACTS = 60;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 「UTC+08:00」「UTC+05:45」「UTC-03:30」 */
export function utcOffsetLabel(tzOffsetHours: number): string {
  const total = Math.round(Math.abs(tzOffsetHours) * 60);
  const sign = tzOffsetHours < 0 ? '-' : '+';
  return `UTC${sign}${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

/** 太陽回歸時刻:「2026-01-01 06:12 (UTC+08:00)」 */
export function solarReturnLine(sr: TransitResult['solarReturn']): string {
  const l = sr.local;
  return `${l.year}-${pad2(l.month)}-${pad2(l.day)} ${pad2(l.hour)}:${pad2(l.minute)} (${utcOffsetLabel(sr.tzOffsetHours)})`;
}

/** 「行運木星 刑相 本命太陽」 */
export function transitAspectLabel(a: Aspect<BodyKey>, locale: Locale): string {
  if (locale === 'en') return `Transit ${bodyName(a.a, locale)} ${aspectName(a.aspect, locale)} natal ${bodyName(a.b, locale)}`;
  return `行運${bodyName(a.a, locale)} ${aspectName(a.aspect, locale)} 本命${bodyName(a.b, locale)}`;
}

/** 「甲方太陽 合相 乙方月亮」 */
export function synastryAspectLabel(a: Aspect<BodyKey>, locale: Locale): string {
  if (locale === 'en') return `A's ${bodyName(a.a, locale)} ${aspectName(a.aspect, locale)} B's ${bodyName(a.b, locale)}`;
  return `甲方${bodyName(a.a, locale)} ${aspectName(a.aspect, locale)} 乙方${bodyName(a.b, locale)}`;
}

function fillAspects(
  facts: { label: string; value: string }[],
  aspects: readonly Aspect<BodyKey>[],
  label: (a: Aspect<BodyKey>) => string,
  locale: Locale,
): void {
  for (const a of aspects.slice(0, Math.max(0, MAX_CONTEXT_FACTS - facts.length))) {
    facts.push({ label: label(a), value: aspectDetail(a, locale) });
  }
}

/** 行運解讀 context(獨立於本命;不併入本命 facts)。 */
export function transitContext(t: TransitResult, locale: Locale): InterpretationContext {
  const en = locale === 'en';
  const date = `${t.today.year}-${pad2(t.today.month)}-${pad2(t.today.day)}`;
  const facts: { label: string; value: string }[] = [
    { label: en ? 'Transit date' : '行運日期', value: en ? `${date} (local noon)` : `${date}(當地正午)` },
    { label: en ? 'Current solar return' : '目前這一年的太陽回歸', value: solarReturnLine(t.solarReturn) },
  ];
  for (const p of t.planets) {
    facts.push({
      label: en ? `Transit ${bodyName(p.body, locale)}` : `行運${bodyName(p.body, locale)}`,
      value: en
        ? `${signName(p.signIndex, locale)} ${degInSign(p.longitude)}°, natal house ${p.house}${p.retrograde ? ' (R)' : ''}`
        : `${signName(p.signIndex, locale)}座 ${degInSign(p.longitude)}°・本命第 ${p.house} 宮${p.retrograde ? '(逆行)' : ''}`,
    });
  }
  fillAspects(facts, t.aspects, (a) => transitAspectLabel(a, locale), locale);
  return {
    systemId: 'astrology',
    locale,
    headline: en ? `Transits ${date}` : `行運 ${date}`,
    facts,
  };
}

function big3(chart: WesternChart, locale: Locale): string {
  const sun = chart.planets.find((p) => p.body === 'sun');
  const moon = chart.planets.find((p) => p.body === 'moon');
  const en = locale === 'en';
  return [
    `${en ? 'Asc' : '上升'} ${signName(chart.ascendant.signIndex, locale)}`,
    sun ? `${en ? 'Sun' : '太陽'} ${signName(sun.signIndex, locale)}` : '',
    moon ? `${en ? 'Moon' : '月亮'} ${signName(moon.signIndex, locale)}` : '',
  ].filter(Boolean).join(en ? ' / ' : '・');
}

/** 合盤解讀 context(獨立於本命)。 */
export function synastryContext(s: SynastryResult, locale: Locale): InterpretationContext {
  const en = locale === 'en';
  const facts: { label: string; value: string }[] = [
    { label: en ? 'Person A' : '甲方', value: big3(s.a, locale) },
    { label: en ? 'Person B' : '乙方', value: big3(s.b, locale) },
  ];
  fillAspects(facts, s.aspects, (a) => synastryAspectLabel(a, locale), locale);
  return {
    systemId: 'astrology',
    locale,
    headline: en ? 'Synastry' : '合盤',
    facts,
  };
}
