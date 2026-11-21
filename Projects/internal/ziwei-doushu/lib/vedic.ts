/**
 * 吠陀占星 —— 純函式(client/server 共用;星曆只經 type-only import,不拉 wasm)。
 *
 * 輸入是 lib/astrology.ts computeSiderealPositions 給的恆星黃道位置(XALEN,Lahiri),本檔算:
 *   整宮制宮位、月宿(nakshatra)與足(pada)、九分盤(D9)、Vimśottarī 大運與小運、出生五支(panchang)。
 * 口徑:
 *   月宿每宿 13°20′,每足 3°20′;宿主依 Ketu→Venus→Sun→Moon→Mars→Rahu→Jupiter→Saturn→Mercury 循環。
 *   D9:每 3°20′ 一分,黃經 ÷ 3°20′ 取整後模 12 即九分盤星座(火象起牡羊、土象起摩羯…的合併式)。
 *   Vimśottarī:出生時月亮所在月宿的宿主起運,首運只走剩下的比例;小運同序、長度 = 大運年 × 小運年 ÷ 120,
 *     首運的小運照整段大運排出後切掉出生前的部分。一年取「恆星年」365.256363 日(太陽回到同一恆星的週期,
 *     與恆星黃道一致)。XALEN vimshottariDasha 用 365.25 日且把首運小運按比例壓縮,不採用。
 *   五支:tithi = (月 − 日) 每 12° 一日;yoga = (日 + 月) 每 13°20′ 一個;karana = 半個 tithi;
 *     vara 取出生地「民用日期」的星期(傳統以日出換日,本站未算日出,寫在頁面註記)。
 * 規則參考 openephem(MIT)vedic.py、varga.py、vimshottari.py,TypeScript 自行重寫;星曆不取其 ayanamsa 擬合係數。
 */
import type { GrahaKey, SiderealPositions } from './astrology';
import type { Locale } from './i18n/config';
import type { Ymd } from './today';

export type { GrahaKey };

const NAK = 360 / 27;
const PADA = NAK / 4;
const norm360 = (x: number): number => ((x % 360) + 360) % 360;

/** 恆星年(日)—— Vimśottarī 年長 */
export const SIDEREAL_YEAR_DAYS = 365.256363;

/** Vimśottarī 次序與年數(合計 120) */
export const DASHA_SEQUENCE: readonly GrahaKey[] = ['ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury'];
export const DASHA_YEARS: Readonly<Record<GrahaKey, number>> = {
  ketu: 7, venus: 20, sun: 6, moon: 10, mars: 7, rahu: 18, jupiter: 16, saturn: 19, mercury: 17,
};

/** 27 宿:梵名、宿曜經漢譯 */
export const NAKSHATRAS: ReadonlyArray<readonly [en: string, zh: string]> = [
  ['Ashvini', '婁宿'], ['Bharani', '胃宿'], ['Krittika', '昴宿'], ['Rohini', '畢宿'], ['Mrigashira', '觜宿'],
  ['Ardra', '參宿'], ['Punarvasu', '井宿'], ['Pushya', '鬼宿'], ['Ashlesha', '柳宿'], ['Magha', '星宿'],
  ['Purva Phalguni', '張宿'], ['Uttara Phalguni', '翼宿'], ['Hasta', '軫宿'], ['Chitra', '角宿'], ['Swati', '亢宿'],
  ['Vishakha', '氐宿'], ['Anuradha', '房宿'], ['Jyeshtha', '心宿'], ['Mula', '尾宿'], ['Purva Ashadha', '箕宿'],
  ['Uttara Ashadha', '斗宿'], ['Shravana', '女宿'], ['Dhanishta', '虛宿'], ['Shatabhisha', '危宿'],
  ['Purva Bhadrapada', '室宿'], ['Uttara Bhadrapada', '壁宿'], ['Revati', '奎宿'],
];

export interface NakshatraPos {
  /** 0 = Ashvini */
  index: number;
  /** 1–4 */
  pada: number;
  lord: GrahaKey;
  /** 已走過該宿的比例 0–1 */
  elapsed: number;
}

export function nakshatraOf(longitude: number): NakshatraPos {
  const L = norm360(longitude);
  const index = Math.min(26, Math.floor(L / NAK));
  // 分界上的浮點誤差會讓 within 略小於 0 或略大於 NAK;夾回範圍,足與已走比例不越界。
  const within = Math.min(NAK, Math.max(0, L - index * NAK));
  return {
    index,
    pada: Math.min(4, Math.max(1, Math.floor(within / PADA) + 1)),
    lord: DASHA_SEQUENCE[index % 9],
    elapsed: within / NAK,
  };
}

/** 星座 0 = 牡羊 */
export const signOf = (longitude: number): number => Math.floor(norm360(longitude) / 30);

/** 九分盤(D9)星座 */
export const navamsaSign = (longitude: number): number => Math.floor(norm360(longitude) / (30 / 9)) % 12;

// ---- Vimśottarī ----

export interface DashaPeriod {
  lord: GrahaKey;
  startJd: number;
  endJd: number;
}
export interface Mahadasha extends DashaPeriod {
  antardashas: DashaPeriod[];
}

export function vimshottari(moonLongitude: number, birthJd: number, yearDays: number = SIDEREAL_YEAR_DAYS): Mahadasha[] {
  const nak = nakshatraOf(moonLongitude);
  const first = DASHA_SEQUENCE.indexOf(nak.lord);
  // 首運的起點推回出生前,讓小運照整段大運排,再切掉出生前的部分。
  let cursor = birthJd - nak.elapsed * DASHA_YEARS[nak.lord] * yearDays;
  const out: Mahadasha[] = [];
  for (let k = 0; k < 9; k++) {
    const pos = (first + k) % 9;
    const lord = DASHA_SEQUENCE[pos];
    const start = cursor;
    const end = start + DASHA_YEARS[lord] * yearDays;
    const antardashas: DashaPeriod[] = [];
    let a = start;
    for (let j = 0; j < 9; j++) {
      const sub = DASHA_SEQUENCE[(pos + j) % 9];
      const len = ((DASHA_YEARS[lord] * DASHA_YEARS[sub]) / 120) * yearDays;
      if (a + len > birthJd) antardashas.push({ lord: sub, startJd: Math.max(a, birthJd), endJd: a + len });
      a += len;
    }
    out.push({ lord, startJd: Math.max(start, birthJd), endJd: end, antardashas });
    cursor = end;
  }
  return out;
}

/** 某時刻所在的大運與小運;超出 120 年範圍回 null。 */
export function dashaAt(mahas: readonly Mahadasha[], jd: number): { maha: Mahadasha; antar: DashaPeriod } | null {
  const maha = mahas.find((m) => jd >= m.startJd && jd < m.endJd);
  const antar = maha?.antardashas.find((a) => jd >= a.startJd && jd < a.endJd);
  return maha && antar ? { maha, antar } : null;
}

// ---- 五支 ----

export interface Panchang {
  /** 1–30;1–15 白分(漸盈),16–30 黑分(漸虧) */
  tithi: number;
  /** 1–27 */
  yoga: number;
  /** 1–60 */
  karana: number;
  /** 月亮月宿 */
  nakshatra: number;
  /** 0 = 星期日(出生地民用日期) */
  vara: number;
}

export function panchangOf(sun: number, moon: number, localDate: Ymd): Panchang {
  const diff = norm360(moon - sun);
  return {
    tithi: Math.floor(diff / 12) + 1,
    yoga: Math.floor(norm360(sun + moon) / NAK) + 1,
    karana: Math.floor(diff / 6) + 1,
    nakshatra: nakshatraOf(moon).index,
    vara: new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day)).getUTCDay(),
  };
}

// ---- 日期 ----

/** Julian Day → 公曆日期(Meeus);加上時區後即當地日期。 */
export function jdToYmd(jd: number, tzOffsetHours = 0): Ymd {
  const j = jd + tzOffsetHours / 24 + 0.5;
  const z = Math.floor(j);
  let a = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);
  const day = Math.floor(b - d - Math.floor(30.6001 * e));
  const month = e < 14 ? e - 1 : e - 13;
  return { year: month > 2 ? c - 4716 : c - 4715, month, day };
}

export const ymdString = (d: Ymd): string =>
  `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

/** 當地日期 00:00 對應的 JD(取「今天」所在的運) */
export function ymdToJd(d: Ymd, tzOffsetHours = 0): number {
  let y = d.year;
  let m = d.month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d.day + b - 1524.5 - tzOffsetHours / 24;
}

// ---- 整盤 ----

export interface VedicGraha {
  key: GrahaKey;
  longitude: number;
  sign: number;
  /** 整宮制 1–12 */
  house: number;
  nakshatra: NakshatraPos;
  navamsa: number;
  retrograde: boolean;
}

export interface VedicChart {
  jd: number;
  tzOffsetHours: number;
  ayanamsa: number;
  ascendant: { longitude: number; sign: number; nakshatra: NakshatraPos; navamsa: number };
  grahas: VedicGraha[];
  panchang: Panchang;
  dasha: { yearDays: number; mahadashas: Mahadasha[] };
}

export function buildVedicChart(raw: SiderealPositions, tzOffsetHours: number): VedicChart {
  const ascSign = signOf(raw.ascendant);
  const lon = (k: GrahaKey) => raw.grahas.find((g) => g.key === k)!.longitude;
  return {
    jd: raw.jd,
    tzOffsetHours,
    ayanamsa: raw.ayanamsa,
    ascendant: {
      longitude: raw.ascendant,
      sign: ascSign,
      nakshatra: nakshatraOf(raw.ascendant),
      navamsa: navamsaSign(raw.ascendant),
    },
    grahas: raw.grahas.map((g) => ({
      key: g.key,
      longitude: g.longitude,
      sign: signOf(g.longitude),
      house: ((signOf(g.longitude) - ascSign + 12) % 12) + 1,
      nakshatra: nakshatraOf(g.longitude),
      navamsa: navamsaSign(g.longitude),
      retrograde: g.retrograde,
    })),
    panchang: panchangOf(lon('sun'), lon('moon'), jdToYmd(raw.jd, tzOffsetHours)),
    dasha: { yearDays: SIDEREAL_YEAR_DAYS, mahadashas: vimshottari(lon('moon'), raw.jd) },
  };
}

// ---- 名稱 ----

export const GRAHA_NAMES: Readonly<Record<GrahaKey, Record<Locale, string>>> = {
  sun: { 'zh-TW': '太陽', en: 'Sun' },
  moon: { 'zh-TW': '月亮', en: 'Moon' },
  mars: { 'zh-TW': '火星', en: 'Mars' },
  mercury: { 'zh-TW': '水星', en: 'Mercury' },
  jupiter: { 'zh-TW': '木星', en: 'Jupiter' },
  venus: { 'zh-TW': '金星', en: 'Venus' },
  saturn: { 'zh-TW': '土星', en: 'Saturn' },
  rahu: { 'zh-TW': '羅睺', en: 'Rahu' },
  ketu: { 'zh-TW': '計都', en: 'Ketu' },
};

export function nakshatraName(index: number, locale: Locale): string {
  const [en, zh] = NAKSHATRAS[index];
  return locale === 'zh-TW' ? `${zh}(${en})` : en;
}

const TITHI_EN = [
  'Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami', 'Ashtami',
  'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi',
];
const ZH_DAY = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四'];

export function tithiName(tithi: number, locale: Locale): string {
  const waxing = tithi <= 15;
  const day = ((tithi - 1) % 15) + 1;
  if (locale === 'zh-TW') {
    if (day === 15) return waxing ? '白分十五(滿月)' : '黑分十五(新月)';
    return `${waxing ? '白分' : '黑分'}${ZH_DAY[day - 1]}`;
  }
  if (day === 15) return waxing ? 'Shukla Purnima (full moon)' : 'Krishna Amavasya (new moon)';
  return `${waxing ? 'Shukla' : 'Krishna'} ${TITHI_EN[day - 1]}`;
}

/** 27 yoga:梵名、中文意譯 */
export const YOGAS: ReadonlyArray<readonly [en: string, zh: string]> = [
  ['Vishkambha', '支撐'], ['Priti', '喜愛'], ['Ayushman', '長壽'], ['Saubhagya', '好運'], ['Shobhana', '光彩'],
  ['Atiganda', '大險'], ['Sukarma', '善業'], ['Dhriti', '堅定'], ['Shula', '尖矛'], ['Ganda', '險結'],
  ['Vriddhi', '增長'], ['Dhruva', '恆常'], ['Vyaghata', '打擊'], ['Harshana', '歡喜'], ['Vajra', '金剛'],
  ['Siddhi', '成就'], ['Vyatipata', '災變'], ['Variyan', '優勝'], ['Parigha', '門閂'], ['Shiva', '吉祥'],
  ['Siddha', '圓滿'], ['Sadhya', '可成'], ['Shubha', '吉善'], ['Shukla', '明淨'], ['Brahma', '梵天'],
  ['Indra', '因陀羅'], ['Vaidhriti', '分離'],
];

/** yoga 1–27 */
export function yogaName(yoga: number, locale: Locale): string {
  const [en, zh] = YOGAS[yoga - 1];
  return locale === 'zh-TW' ? `${en}(${zh},第 ${yoga}/27)` : `${en} (${yoga}/27)`;
}

const MOVABLE_KARANAS = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Garaja', 'Vanija', 'Vishti'] as const;

/** karana 1–60:1 Kimstughna;2–57 七個活動 karana 循環;58–60 Shakuni、Chatushpada、Naga(與 1 合為四個固定 karana)。 */
export function karanaName(karana: number, locale: Locale): string {
  const fixed = karana === 1 || karana >= 58;
  const en = karana === 1 ? 'Kimstughna' : fixed ? ['Shakuni', 'Chatushpada', 'Naga'][karana - 58] : MOVABLE_KARANAS[(karana - 2) % 7];
  return locale === 'zh-TW' ? `${en}(${fixed ? '固定' : '活動'}半太陰日,第 ${karana}/60)` : `${en} (${karana}/60)`;
}

const VARA: Record<Locale, readonly string[]> = {
  'zh-TW': ['日曜日(星期日)', '月曜日(星期一)', '火曜日(星期二)', '水曜日(星期三)', '木曜日(星期四)', '金曜日(星期五)', '土曜日(星期六)'],
  en: ['Sunday (Sun)', 'Monday (Moon)', 'Tuesday (Mars)', 'Wednesday (Mercury)', 'Thursday (Jupiter)', 'Friday (Venus)', 'Saturday (Saturn)'],
};
export const varaName = (vara: number, locale: Locale): string => VARA[locale][vara];
