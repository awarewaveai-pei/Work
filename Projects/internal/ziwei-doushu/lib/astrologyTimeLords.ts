/**
 * 西洋傳統占星的時間主星技法 — 純函式，client/server 共用（不碰 wasm）。
 *
 * 規則數值取自 openephem（MIT），程式自行重寫：
 * - 年長一律 365.2425 天（回歸年）；月 = 年 ÷ 12。所有期間以「出生後第幾天」表示。
 * - 法達（firdaria.py）：日盤順序 日10 金8 水13 月9 土11 木12 火7 北交3 南交2，
 *   夜盤 月9 土11 木12 火7 日10 金8 水13 北交3 南交2；共 75 年後循環。
 *   七顆行星的大運各分 7 段等長小運，從大運主星起依同一盤別的行星順序輪替；
 *   南北交點的大運不再細分（同 Abu Ma'shar；openephem 預設會細分，此處不採）；夜盤交點位置依 openephem 放在最後
 *   （Bonatti 的夜盤把交點放在火星之後，此處不採）。
 * - 黃道釋放（zodiacal_releasing.py）：從福點或精神點所在星座起，每個星座的期間 = 其守護星小年
 *   （牡羊15 金牛8 雙子20 巨蟹25 獅子19 處女20 天秤8 天蠍15 射手12 摩羯27 水瓶30 雙魚12）；
 *   第 1 層單位為年、第 2 層為月（年 ÷ 12），從上一層的星座起算。同一層連續走完 12 個星座仍未填滿時
 *   「解除束縛」（loosing of the bond），跳到該層起點星座的對宮繼續。
 *   角宮（巔峰期）一律自福點星座起算第 1、4、7、10 個星座。
 * - 十年期（decennials.py）：七顆行星依迦勒底順序（土 木 火 日 金 水 月）輪替，每段 129 個月（10 年 9 個月），
 *   段內再依同一順序、從該段主星起，各給其小年數的月份（土30 木12 火15 日19 金8 水20 月25）；
 *   75.25 年後循環。起始行星取福點所在星座的守護星（openephem 文件所稱的傳統預設）。
 */
import type { ClassicalPlanet } from './astrologyTraditional';
import type { Ymd } from './today';

export const YEAR_DAYS = 365.2425;
const MONTH_DAYS = YEAR_DAYS / 12;
const DAY_MS = 86_400_000;

export interface BirthMoment {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/**
 * 出生到「今天正午」經過的天數。兩邊都當當地牆上時間計，不換算時區：
 * 出生地與所在地的時差最多讓結果差不到一天，而時間主星的期間以年月計。
 */
export function elapsedDays(birth: BirthMoment, today: Ymd): number {
  const b = Date.UTC(birth.year, birth.month - 1, birth.day, birth.hour, birth.minute);
  const t = Date.UTC(today.year, today.month - 1, today.day, 12, 0);
  return (t - b) / DAY_MS;
}

/** 出生後第 days 天是哪一天（出生地當地日期） */
export function dateAfterBirth(birth: BirthMoment, days: number): Ymd {
  const d = new Date(Date.UTC(birth.year, birth.month - 1, birth.day, birth.hour, birth.minute) + days * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export interface Period<R> {
  ruler: R;
  /** 出生後第幾天開始（含） */
  start: number;
  /** 出生後第幾天結束（不含） */
  end: number;
}

// ---------------------------------------------------------------- 法達

export type FirdariaLord = ClassicalPlanet | 'northNode' | 'southNode';

const FIRDARIA_DAY: readonly [FirdariaLord, number][] = [
  ['sun', 10], ['venus', 8], ['mercury', 13], ['moon', 9], ['saturn', 11],
  ['jupiter', 12], ['mars', 7], ['northNode', 3], ['southNode', 2],
];
const FIRDARIA_NIGHT: readonly [FirdariaLord, number][] = [
  ['moon', 9], ['saturn', 11], ['jupiter', 12], ['mars', 7], ['sun', 10],
  ['venus', 8], ['mercury', 13], ['northNode', 3], ['southNode', 2],
];
export const FIRDARIA_CYCLE_YEARS = 75;

export interface FirdariaNow {
  major: Period<FirdariaLord>;
  /** 交點大運不細分 → null */
  sub: Period<ClassicalPlanet> | null;
}

/** 某一天所在的法達大運與小運；days < 0（出生前）回傳 null。 */
export function firdariaAt(diurnal: boolean, days: number): FirdariaNow | null {
  if (days < 0) return null;
  const order = diurnal ? FIRDARIA_DAY : FIRDARIA_NIGHT;
  const planets = order.filter(([r]) => r !== 'northNode' && r !== 'southNode').map(([r]) => r as ClassicalPlanet);
  const cycleDays = FIRDARIA_CYCLE_YEARS * YEAR_DAYS;
  let t = Math.floor(days / cycleDays) * cycleDays;
  for (const [ruler, years] of order) {
    const end = t + years * YEAR_DAYS;
    if (days < end) {
      const major = { ruler, start: t, end };
      if (ruler === 'northNode' || ruler === 'southNode') return { major, sub: null };
      const len = (years * YEAR_DAYS) / 7;
      const i = Math.min(6, Math.floor((days - t) / len));
      const si = planets.indexOf(ruler);
      return { major, sub: { ruler: planets[(si + i) % 7], start: t + i * len, end: t + (i + 1) * len } };
    }
    t = end;
  }
  return null; // 不會到這裡：一個循環剛好 75 年
}

/** 第一個 75 年循環的全部大運（畫面列表用） */
export function firdariaMajors(diurnal: boolean): Period<FirdariaLord>[] {
  let t = 0;
  return (diurnal ? FIRDARIA_DAY : FIRDARIA_NIGHT).map(([ruler, years]) => {
    const p = { ruler, start: t, end: t + years * YEAR_DAYS };
    t = p.end;
    return p;
  });
}

// ---------------------------------------------------------------- 黃道釋放

/** 依星座索引（0 = 牡羊）的守護星小年 */
export const LESSER_YEARS = [15, 8, 20, 25, 19, 20, 8, 15, 12, 27, 30, 12] as const;

export type Angularity = 'angular' | 'succedent' | 'cadent';

export interface ReleasePeriod {
  signIndex: number;
  start: number;
  end: number;
  /** 解除束縛後的第一段 */
  loosing: boolean;
  /** 相對福點星座：角宮（巔峰期）／續宮／果宮 */
  angularity: Angularity;
}

function angularityFrom(fortuneSign: number, sign: number): Angularity {
  return (['angular', 'succedent', 'cadent'] as const)[(((sign - fortuneSign) % 12) + 12) % 3];
}

/** 從 startSign 起，於 [from, from + total) 內依序釋放；單位天數 unit。 */
function release(startSign: number, from: number, total: number, unit: number, fortuneSign: number): ReleasePeriod[] {
  const out: ReleasePeriod[] = [];
  let sign = startSign;
  let t = from;
  let n = 0;
  let loosing = false;
  while (t < from + total - 1e-9) {
    const end = Math.min(t + LESSER_YEARS[sign] * unit, from + total);
    out.push({ signIndex: sign, start: t, end, loosing, angularity: angularityFrom(fortuneSign, sign) });
    t = end;
    n++;
    loosing = n % 12 === 0;
    sign = loosing ? (startSign + 6) % 12 : (sign + 1) % 12;
  }
  return out;
}

export interface ReleasingNow {
  l1: ReleasePeriod;
  l2: ReleasePeriod;
}

/**
 * 某一天的黃道釋放第 1、2 層。lotSign = 釋放所用的點（福點或精神點）的星座，fortuneSign = 福點星座。
 * days < 0 回傳 null。
 */
export function releasingAt(lotSign: number, fortuneSign: number, days: number): ReleasingNow | null {
  if (days < 0) return null;
  // 第 1 層一圈 211 年，人的一生走不完一圈；釋放到涵蓋 days 為止
  const l1s = release(lotSign, 0, days + YEAR_DAYS * 40, YEAR_DAYS, fortuneSign);
  const l1 = l1s.find((p) => days >= p.start && days < p.end)!;
  const l2s = release(l1.signIndex, l1.start, l1.end - l1.start, MONTH_DAYS, fortuneSign);
  const l2 = l2s.find((p) => days >= p.start && days < p.end) ?? l2s[l2s.length - 1];
  return { l1, l2 };
}

// ---------------------------------------------------------------- 十年期

export const CHALDEAN: readonly ClassicalPlanet[] = ['saturn', 'jupiter', 'mars', 'sun', 'venus', 'mercury', 'moon'];
export const MINOR_YEARS: Record<ClassicalPlanet, number> = {
  saturn: 30, jupiter: 12, mars: 15, sun: 19, venus: 8, mercury: 20, moon: 25,
};
/** 每段十年期 = 129 個月 */
export const DECENNIAL_MONTHS = 129;

export interface DecennialNow {
  major: Period<ClassicalPlanet>;
  sub: Period<ClassicalPlanet>;
}

export function decennialAt(startPlanet: ClassicalPlanet, days: number): DecennialNow | null {
  if (days < 0) return null;
  const majorLen = DECENNIAL_MONTHS * MONTH_DAYS;
  const k = Math.floor(days / majorLen);
  const s0 = CHALDEAN.indexOf(startPlanet);
  const majorStart = k * majorLen;
  const major = { ruler: CHALDEAN[(s0 + k) % 7], start: majorStart, end: majorStart + majorLen };
  let t = majorStart;
  for (let j = 0; j < 7; j++) {
    const ruler = CHALDEAN[(s0 + k + j) % 7];
    const end = t + MINOR_YEARS[ruler] * MONTH_DAYS;
    if (days < end || j === 6) return { major, sub: { ruler, start: t, end } };
    t = end;
  }
  return null;
}
