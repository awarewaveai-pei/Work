import type { Locale } from './i18n/config';
import type { BodyKey, WesternChart } from './astrology';
import type { InterpretationContext } from './divination/types';

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
