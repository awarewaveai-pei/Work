/**
 * 西洋傳統（古典）占星 — 純函式，client/server 共用（不碰 wasm）。
 *
 * 採用的傳統與出處：
 * - 守護星（廟）：托勒密《四書》（Tetrabiblos）I.17，七顆古典行星，不用現代外行星守護（天蠍＝火星、水瓶＝土星、雙魚＝木星）。
 * - 旺位星座：《四書》I.19；旺位度數（日牡羊 19、月金牛 3、水處女 15、金雙魚 27、火摩羯 28、木巨蟹 15、土天秤 21）
 *   為希臘化時期以來的通行值，與 flatlib `dignities/tables.py` ESSENTIAL_DIGNITIES 一致；度數只顯示，不影響判定。
 * - 陷＝廟的對宮、失勢＝旺的對宮（由上兩表推出，不另列表）。
 * - 計分（flatlib `dignities/essential.py` SCORES，Lilly 制）：廟 +5、旺 +4、陷 −5、失勢 −4。
 * - 三分主、界、面不做：flatlib 預設的三分主與面表沒有標出處，界表有多套（埃及、托勒密）互不一致。
 * - 日夜盤：太陽在地平線上（黃經自上升點往增加方向 180°–360° 區間，即第 7–12 宮一側）＝日盤；太陽正在上升點上算夜盤。
 *   以黃經判斷，忽略太陽黃緯（恆近 0）。
 * - 福點／精神點（flatlib `tools/arabicparts.py` PARS_FORTUNA、PARS_SPIRIT）：
 *   福點 日盤＝上升＋月−日、夜盤＝上升＋日−月；精神點日夜相反。宮位用整宮制（自上升星座起算）。
 * - 年小限（openephem `profections.py`）：0 歲＝上升星座為第 1 宮，每滿一歲前進一個星座；
 *   年主星＝該星座的古典守護星。年齡依出生日與今天（使用者時區）算足歲。
 */
import type { BodyKey } from './astrology';
import type { Ymd } from './today';

export const CLASSICAL_PLANETS = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'] as const;
export type ClassicalPlanet = (typeof CLASSICAL_PLANETS)[number];

/** 星座索引（0=牡羊…11=雙魚）→ 古典守護星 */
export const DOMICILE_RULER: readonly ClassicalPlanet[] = [
  'mars', 'venus', 'mercury', 'moon', 'sun', 'mercury',
  'venus', 'mars', 'jupiter', 'saturn', 'saturn', 'jupiter',
];

export const EXALTATION: Record<ClassicalPlanet, { signIndex: number; degree: number }> = {
  sun: { signIndex: 0, degree: 19 },
  moon: { signIndex: 1, degree: 3 },
  mercury: { signIndex: 5, degree: 15 },
  venus: { signIndex: 11, degree: 27 },
  mars: { signIndex: 9, degree: 28 },
  jupiter: { signIndex: 3, degree: 15 },
  saturn: { signIndex: 6, degree: 21 },
};

export type DignityKey = 'domicile' | 'exaltation' | 'detriment' | 'fall';

export const DIGNITY_SCORE: Record<DignityKey, number> = {
  domicile: 5,
  exaltation: 4,
  detriment: -5,
  fall: -4,
};

const opposite = (signIndex: number): number => (signIndex + 6) % 12;

export function isClassical(body: string): body is ClassicalPlanet {
  return (CLASSICAL_PLANETS as readonly string[]).includes(body);
}

/** 一顆古典行星落在某星座的本質尊貴（水星在雙魚同時陷與失勢）。 */
export function essentialDignity(
  planet: ClassicalPlanet,
  signIndex: number,
): { dignities: DignityKey[]; score: number } {
  const dignities: DignityKey[] = [];
  if (DOMICILE_RULER[signIndex] === planet) dignities.push('domicile');
  if (EXALTATION[planet].signIndex === signIndex) dignities.push('exaltation');
  if (DOMICILE_RULER[opposite(signIndex)] === planet) dignities.push('detriment');
  if (opposite(EXALTATION[planet].signIndex) === signIndex) dignities.push('fall');
  return { dignities, score: dignities.reduce((s, d) => s + DIGNITY_SCORE[d], 0) };
}

const norm360 = (x: number): number => (((x % 360) + 360) % 360);

/** 太陽在地平線上 = 日盤 */
export function isDiurnal(sunLon: number, ascLon: number): boolean {
  return norm360(sunLon - ascLon) >= 180;
}

/** 福點與精神點黃經 */
export function lots(
  ascLon: number,
  sunLon: number,
  moonLon: number,
  diurnal: boolean,
): { fortune: number; spirit: number } {
  const moonMinusSun = moonLon - sunLon;
  return {
    fortune: norm360(ascLon + (diurnal ? moonMinusSun : -moonMinusSun)),
    spirit: norm360(ascLon + (diurnal ? -moonMinusSun : moonMinusSun)),
  };
}

/** 整宮制宮位（1–12）：上升星座為第 1 宮 */
export function wholeSignHouse(signIndex: number, ascSignIndex: number): number {
  return ((signIndex - ascSignIndex + 12) % 12) + 1;
}

/** 足歲；today 早於生日回傳 null */
export function ageOn(birth: Ymd, today: Ymd): number | null {
  const beforeBirthday =
    today.month < birth.month || (today.month === birth.month && today.day < birth.day);
  const age = today.year - birth.year - (beforeBirthday ? 1 : 0);
  return age < 0 ? null : age;
}

export interface Profection {
  age: number;
  /** 整宮制第幾宮（1–12） */
  house: number;
  signIndex: number;
  lord: ClassicalPlanet;
}

export function annualProfection(ascSignIndex: number, birth: Ymd, today: Ymd): Profection | null {
  const age = ageOn(birth, today);
  if (age === null) return null;
  const signIndex = (ascSignIndex + age) % 12;
  return { age, house: (age % 12) + 1, signIndex, lord: DOMICILE_RULER[signIndex] };
}

export interface TraditionalReading {
  diurnal: boolean;
  dignities: { planet: ClassicalPlanet; signIndex: number; dignities: DignityKey[]; score: number }[];
  fortune: { longitude: number; signIndex: number; house: number };
  spirit: { longitude: number; signIndex: number; house: number };
  profection: Profection | null;
}

/** 由本命盤資料組出傳統占星結果。缺日或月時回傳 null。 */
export function traditionalReading(
  chart: {
    ascendant: { longitude: number; signIndex: number };
    planets: readonly { body: BodyKey; longitude: number; signIndex: number }[];
  },
  birth: Ymd,
  today: Ymd,
): TraditionalReading | null {
  const sun = chart.planets.find((p) => p.body === 'sun');
  const moon = chart.planets.find((p) => p.body === 'moon');
  if (!sun || !moon) return null;
  const asc = chart.ascendant;
  const diurnal = isDiurnal(sun.longitude, asc.longitude);
  const { fortune, spirit } = lots(asc.longitude, sun.longitude, moon.longitude, diurnal);
  const place = (lon: number) => {
    const signIndex = Math.floor(lon / 30) % 12;
    return { longitude: lon, signIndex, house: wholeSignHouse(signIndex, asc.signIndex) };
  };
  const dignities: TraditionalReading['dignities'] = [];
  for (const p of chart.planets) {
    if (isClassical(p.body)) dignities.push({ planet: p.body, signIndex: p.signIndex, ...essentialDignity(p.body, p.signIndex) });
  }
  return {
    diurnal,
    dignities,
    fortune: place(fortune),
    spirit: place(spirit),
    profection: annualProfection(asc.signIndex, birth, today),
  };
}
