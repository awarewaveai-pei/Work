import type { Locale } from './i18n/config';
import type { BodyKey, SynastryResult, TransitResult, WesternChart } from './astrology';
import type { InterpretationContext } from './divination/types';
import type { Aspect, AspectKey } from './astrologyAspects';
import type {
  ArabicPartKey,
  DignityKey,
  Profection,
  SunRelation,
  TechniquesReading,
  TraditionalReading,
} from './astrologyTraditional';
import type { Angularity, BirthMoment, FirdariaLord, Period, ReleasePeriod } from './astrologyTimeLords';
import { YEAR_DAYS, dateAfterBirth } from './astrologyTimeLords';

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

// ---------------------------------------------------------------- 時間主星與其餘技法(獨立 context)

export const PART_NAMES: Record<ArabicPartKey, Record<Locale, string>> = {
  faith: { 'zh-TW': '信仰點', en: 'Lot of Faith' },
  substance: { 'zh-TW': '財物點', en: 'Lot of Substance' },
  weddingMale: { 'zh-TW': '婚姻點(男命)', en: 'Lot of Marriage (men)' },
  weddingFemale: { 'zh-TW': '婚姻點(女命)', en: 'Lot of Marriage (women)' },
  sons: { 'zh-TW': '子女點', en: 'Lot of Children' },
  father: { 'zh-TW': '父親點', en: 'Lot of the Father' },
  mother: { 'zh-TW': '母親點', en: 'Lot of the Mother' },
  brothers: { 'zh-TW': '手足點', en: 'Lot of Siblings' },
  diseases: { 'zh-TW': '疾病點', en: 'Lot of Illness' },
  death: { 'zh-TW': '死亡點', en: 'Lot of Death' },
  travel: { 'zh-TW': '旅行點', en: 'Lot of Travel' },
  friends: { 'zh-TW': '朋友點', en: 'Lot of Friends' },
  enemies: { 'zh-TW': '敵人點', en: 'Lot of Enemies' },
  saturn: { 'zh-TW': '土星點(宿命)', en: 'Lot of Saturn (Nemesis)' },
  jupiter: { 'zh-TW': '木星點(勝利)', en: 'Lot of Jupiter (Victory)' },
  mars: { 'zh-TW': '火星點(勇氣)', en: 'Lot of Mars (Courage)' },
  venus: { 'zh-TW': '金星點(愛欲)', en: 'Lot of Venus (Eros)' },
  mercury: { 'zh-TW': '水星點(必然)', en: 'Lot of Mercury (Necessity)' },
  horsemanship: { 'zh-TW': '騎術點', en: 'Lot of Horsemanship' },
};

export const SUN_RELATION_NAMES: Record<SunRelation, Record<Locale, string>> = {
  cazimi: { 'zh-TW': '日核', en: 'cazimi' },
  combust: { 'zh-TW': '燃燒', en: 'combust' },
  underBeams: { 'zh-TW': '在太陽光束下', en: 'under the beams' },
};

const ANGULARITY_NAMES: Record<Angularity, Record<Locale, string>> = {
  angular: { 'zh-TW': '角宮・巔峰期', en: 'angular (peak)' },
  succedent: { 'zh-TW': '續宮', en: 'succedent' },
  cadent: { 'zh-TW': '果宮', en: 'cadent' },
};

export function lordName(lord: FirdariaLord, locale: Locale): string {
  if (lord === 'southNode') return locale === 'en' ? 'South Node' : '南交點';
  return bodyName(lord, locale);
}

function ymdText(d: { year: number; month: number; day: number }): string {
  return `${d.year}-${pad2(d.month)}-${pad2(d.day)}`;
}

/** 「2016-01-01 ～ 2025-01-01(16.0–25.0 歲)」 */
export function periodRange(p: { start: number; end: number }, birth: BirthMoment, locale: Locale): string {
  const a = (p.start / YEAR_DAYS).toFixed(1);
  const b = (p.end / YEAR_DAYS).toFixed(1);
  const dates = `${ymdText(dateAfterBirth(birth, p.start))} ～ ${ymdText(dateAfterBirth(birth, p.end))}`;
  return locale === 'en' ? `${dates} (age ${a}–${b})` : `${dates}(${a}–${b} 歲)`;
}

export function firdariaLine(r: TechniquesReading, birth: BirthMoment, locale: Locale): string {
  const f = r.firdaria!;
  const major = `${lordName(f.major.ruler, locale)} ${periodRange(f.major, birth, locale)}`;
  if (!f.sub) return major;
  const sub = `${lordName(f.sub.ruler, locale)} ${periodRange(f.sub, birth, locale)}`;
  return locale === 'en' ? `major ${major}; sub ${sub}` : `大運 ${major}・小運 ${sub}`;
}

function releaseLevel(p: ReleasePeriod, birth: BirthMoment, locale: Locale): string {
  const lb = p.loosing ? (locale === 'en' ? ', loosing of the bond' : '・解除束縛') : '';
  const ang = ANGULARITY_NAMES[p.angularity][locale];
  return locale === 'en'
    ? `${signName(p.signIndex, locale)} (${ang}${lb}) ${periodRange(p, birth, locale)}`
    : `${signName(p.signIndex, locale)}(${ang}${lb})${periodRange(p, birth, locale)}`;
}

export function releasingLine(z: NonNullable<TechniquesReading['releasingFortune']>, birth: BirthMoment, locale: Locale): string {
  return locale === 'en'
    ? `L1 ${releaseLevel(z.l1, birth, locale)}; L2 ${releaseLevel(z.l2, birth, locale)}`
    : `第一層 ${releaseLevel(z.l1, birth, locale)}・第二層 ${releaseLevel(z.l2, birth, locale)}`;
}

export function decennialLine(r: TechniquesReading, birth: BirthMoment, locale: Locale): string {
  const d = r.decennial!;
  const span = (p: Period<typeof d.major.ruler>) => `${bodyName(p.ruler, locale)} ${periodRange(p, birth, locale)}`;
  return locale === 'en' ? `general ${span(d.major)}; sub ${span(d.sub)}` : `主段 ${span(d.major)}・分段 ${span(d.sub)}`;
}

export function sunRelationsLine(r: TechniquesReading, locale: Locale): string {
  if (r.sunRelations.length === 0) {
    return locale === 'en' ? 'no planet within 16° of the Sun' : '沒有行星在太陽 16° 以內';
  }
  return r.sunRelations
    .map((x) => `${bodyName(x.planet, locale)} ${SUN_RELATION_NAMES[x.relation][locale]} ${x.distance.toFixed(1)}°`)
    .join(locale === 'en' ? '; ' : '、');
}

export function partLine(p: TechniquesReading['parts'][number], locale: Locale): string {
  return lotLine(p, locale);
}

/** 時間主星與其餘傳統技法的解讀 context(獨立於本命,≤ 6 + 19 = 25 條)。 */
export function techniquesContext(r: TechniquesReading, birth: BirthMoment, locale: Locale): InterpretationContext {
  const en = locale === 'en';
  const facts: { label: string; value: string }[] = [
    { label: en ? 'Sect' : '日夜盤', value: sectName(r.diurnal, locale) },
  ];
  if (r.firdaria) facts.push({ label: en ? 'Firdaria now' : '目前法達', value: firdariaLine(r, birth, locale) });
  if (r.releasingFortune) {
    facts.push({ label: en ? 'Zodiacal releasing from Fortune' : '黃道釋放(福點)', value: releasingLine(r.releasingFortune, birth, locale) });
  }
  if (r.releasingSpirit) {
    facts.push({ label: en ? 'Zodiacal releasing from Spirit' : '黃道釋放(精神點)', value: releasingLine(r.releasingSpirit, birth, locale) });
  }
  if (r.decennial) facts.push({ label: en ? 'Decennials now' : '目前十年期', value: decennialLine(r, birth, locale) });
  facts.push({ label: en ? 'Planets near the Sun' : '與太陽距離', value: sunRelationsLine(r, locale) });
  for (const p of r.parts) facts.push({ label: PART_NAMES[p.key][locale], value: partLine(p, locale) });
  return {
    systemId: 'astrology',
    locale,
    headline: en ? 'Time lords and traditional techniques' : '時間主星與傳統技法',
    facts: facts.slice(0, MAX_CONTEXT_FACTS),
  };
}
