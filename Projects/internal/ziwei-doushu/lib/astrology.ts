import { initSync, XalenWasm } from '@xalen/wasm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeAspects, type Aspect } from './astrologyAspects';
import { findReturnJd, jdToDateTime, transitAspects, type DateTimeParts } from './astrologyTransits';
import { synastryAspects } from './astrologySynastry';
import type { Ymd } from './today';

/**
 * 西洋占星本命盤引擎 — 自架 XALEN(@xalen/wasm,Apache-2.0,**無需 API key**)。
 *
 * 精度:VSOP87A + IAU2000B 章動 + ELP2000 月亮,對 JPL Horizons DE440 / Swiss
 *   Ephemeris 交叉驗證(太陽 0.21″、行星次角秒;對 Swiss 1850–2150 五百萬盤無一
 *   超 0.1°)。故可正當聲稱「最準」,非 Moshier 捷徑(PLAN §5 警告)。
 * 黃道:用 tropical(回歸黃道,西洋制)直接取,毋須 ayanamsa。
 *
 * ⚠️ 伺服器端專用(載入 1.75MB wasm + fs);client 取盤走 /api/astrology。
 *   wasm 須在 standalone 部署被追蹤 → next.config outputFileTracingIncludes 已加。
 */

// XALEN body id(README 文件):0 日 1 月 2 水 3 金 4 火 5 木 6 土 7 天 8 海 9 北交 11 冥 12 凱龍
export const WESTERN_BODIES = [
  { key: 'sun', id: 0 },
  { key: 'moon', id: 1 },
  { key: 'mercury', id: 2 },
  { key: 'venus', id: 3 },
  { key: 'mars', id: 4 },
  { key: 'jupiter', id: 5 },
  { key: 'saturn', id: 6 },
  { key: 'uranus', id: 7 },
  { key: 'neptune', id: 8 },
  { key: 'pluto', id: 11 },
  { key: 'northNode', id: 9 },
  { key: 'chiron', id: 12 },
] as const;

export type BodyKey = (typeof WESTERN_BODIES)[number]['key'];

/** 2 = Placidus(西洋最常用宮位制;XALEN systemId)。 */
const PLACIDUS = 2;

export interface WesternPlanet {
  body: BodyKey;
  /** 黃道經度 0–360 */
  longitude: number;
  /** 星座索引 0=牡羊…11=雙魚 */
  signIndex: number;
  /** 落入宮位 1–12 */
  house: number;
  retrograde: boolean;
  /** 黃經速度(度/日,XALEN lon_speed;負 = 逆行) */
  speed: number;
}

export interface WesternChart {
  jd: number;
  ascendant: { longitude: number; signIndex: number };
  mc: { longitude: number; signIndex: number };
  /** 12 宮頭黃道度 */
  houseCusps: number[];
  planets: WesternPlanet[];
  /** 本命主要相位,依偏離由小到大(lib/astrologyAspects.ts) */
  aspects: Aspect<BodyKey>[];
  /** 高緯(|lat|≳66.5°)Placidus 退化,XALEN 改用替代宮位制 */
  fallbackHouses: boolean;
}

export interface WesternRequest {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 時區偏移(東為正,如台灣 +8) */
  tzOffsetHours: number;
  /** 出生地緯度(北為正) */
  lat: number;
  /** 出生地經度(東為正) */
  lon: number;
}

/** Gregorian(UT)→ Julian Day。standard algorithm;jd(2000-01-01 12:00 UT)=2451545.0。 */
export function julianDay(
  year: number,
  month: number,
  day: number,
  hourUT: number,
): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  const jd0 =
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    day +
    b -
    1524.5;
  return jd0 + hourUT / 24;
}

export function signIndexOf(longitude: number): number {
  return Math.floor((((longitude % 360) + 360) % 360) / 30);
}

/** 行星黃道經度落在哪一宮(Placidus 宮頭不等分,需逐宮判斷含跨 0° 環繞)。cusps 須為「度」。 */
export function houseOf(longitude: number, cusps: number[]): number {
  const L = (((longitude % 360) + 360) % 360);
  for (let i = 0; i < 12; i++) {
    const start = cusps[i];
    const end = cusps[(i + 1) % 12];
    // 處理跨 360→0 的宮(end < start)
    const inHouse =
      start <= end
        ? L >= start && L < end
        : L >= start || L < end;
    if (inHouse) return i + 1;
  }
  return 1;
}

let wasmReady = false;
let handle: XalenWasm | null = null;
function getXalen(): XalenWasm {
  if (!wasmReady) {
    const bytes = readFileSync(
      join(process.cwd(), 'node_modules/@xalen/wasm/xalen_wasm_bg.wasm'),
    );
    initSync({ module: bytes });
    wasmReady = true;
  }
  if (!handle) handle = new XalenWasm();
  return handle;
}

const RAD2DEG = 180 / Math.PI;
const norm360 = (x: number): number => (((x % 360) + 360) % 360);

/** 某時刻十二星體位置;宮位依給定宮頭(行運用本命宮頭)。 */
function bodyPositions(w: XalenWasm, jd: number, cusps: number[]): WesternPlanet[] {
  return WESTERN_BODIES.map((b) => {
    const p = JSON.parse(
      w.planetPositionJson(jd, b.id, false, 0),
    ) as { longitude: number; lon_speed: number; is_retrograde: boolean };
    return {
      body: b.key,
      longitude: p.longitude,
      signIndex: signIndexOf(p.longitude),
      house: houseOf(p.longitude, cusps),
      retrograde: Boolean(p.is_retrograde),
      speed: p.lon_speed,
    };
  });
}

export function computeWesternChart(req: WesternRequest): WesternChart {
  const w = getXalen();
  const hourUT = req.hour + req.minute / 60 - req.tzOffsetHours;
  const jd = julianDay(req.year, req.month, req.day, hourUT);

  const houses = JSON.parse(w.housesJson(jd, req.lat, req.lon, PLACIDUS)) as {
    cusps: number[];
    ascendant: number;
    mc: number;
    fallback_used?: boolean;
  };
  // ⚠️ XALEN housesJson 的 cusps/ascendant/mc 是「弧度」,planetPositionJson 的
  //   longitude 是「度」(實測 2026-06-26,critic 抓到)。在邊界統一轉成度,否則
  //   宮位/上升/天頂全錯(行星經度<->弧度宮頭比較會塌成單一宮)。
  const cusps = houses.cusps.map((c) => norm360(c * RAD2DEG));
  const ascDeg = norm360(houses.ascendant * RAD2DEG);
  const mcDeg = norm360(houses.mc * RAD2DEG);

  const planets = bodyPositions(w, jd, cusps);

  return {
    jd,
    ascendant: { longitude: ascDeg, signIndex: signIndexOf(ascDeg) },
    mc: { longitude: mcDeg, signIndex: signIndexOf(mcDeg) },
    houseCusps: cusps,
    planets,
    aspects: computeAspects(planets),
    fallbackHouses: Boolean(houses.fallback_used),
  };
}

/**
 * 生辰欄位驗證(各 /api/astrology* 路由共用)。成功回 WesternRequest,失敗回錯誤說明字串。
 * 拒絕不存在的日期(2/31 等):native date picker 已擋,但 API 可直打。
 */
export function parseWesternRequest(v: unknown): WesternRequest | string {
  if (!v || typeof v !== 'object') return 'birth object required';
  const b = v as Record<string, unknown>;
  const num = (x: unknown, lo: number, hi: number): number | null =>
    typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi ? x : null;
  const year = num(b.year, 1800, 2200);
  const month = num(b.month, 1, 12);
  const day = num(b.day, 1, 31);
  const hour = num(b.hour, 0, 23);
  const minute = num(b.minute, 0, 59);
  const tzOffsetHours = num(b.tzOffsetHours, -12, 14);
  const lat = num(b.lat, -90, 90);
  const lon = num(b.lon, -180, 180);
  if (
    year === null || month === null || day === null || hour === null ||
    minute === null || tzOffsetHours === null || lat === null || lon === null
  ) {
    return 'bad birth/location fields';
  }
  if (!isRealDate(year, month, day)) return 'impossible calendar date';
  return { year, month, day, hour, minute, tzOffsetHours, lat, lon };
}

export function isRealDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

export interface TransitResult {
  /** 行運時刻(today 當地正午)JD UT */
  jd: number;
  today: Ymd;
  /** 行運星體;house = 落在本命盤的哪一宮 */
  planets: WesternPlanet[];
  /** 行運對本命,依偏離由小到大(lib/astrologyTransits.ts) */
  aspects: Aspect<BodyKey>[];
  /** 最近一次(不晚於行運時刻)太陽回歸:太陽回到本命太陽黃經,即目前這一年的太陽回歸盤時刻 */
  solarReturn: { jd: number; local: DateTimeParts; tzOffsetHours: number };
}

/**
 * 行運 + 太陽回歸。today / viewerTzOffsetHours 由 client 給(lib/today.ts localToday 與瀏覽器時區),
 * 伺服器不自己取「今天」(伺服器時區不是使用者時區)。
 */
export function computeTransits(birth: WesternRequest, today: Ymd, viewerTzOffsetHours: number): TransitResult {
  const w = getXalen();
  const natal = computeWesternChart(birth);
  const jd = julianDay(today.year, today.month, today.day, 12 - viewerTzOffsetHours);
  const planets = bodyPositions(w, jd, natal.houseCusps);
  const natalSun = natal.planets.find((p) => p.body === 'sun')!;
  const birthHourUT = birth.hour + birth.minute / 60 - birth.tzOffsetHours;
  const sunAt = (t: number) => w.tropicalLongitude(t, 0);
  const returnIn = (year: number) =>
    findReturnJd(sunAt, natalSun.longitude, julianDay(year, birth.month, birth.day, birthHourUT));
  // 今年生日附近的回歸若還沒到,目前生效的是去年那一次
  let srJd = returnIn(today.year);
  if (srJd > jd) srJd = returnIn(today.year - 1);
  return {
    jd,
    today,
    planets,
    aspects: transitAspects(planets, natal.planets),
    solarReturn: {
      jd: srJd,
      local: jdToDateTime(srJd, viewerTzOffsetHours),
      tzOffsetHours: viewerTzOffsetHours,
    },
  };
}

export interface SynastryResult {
  a: WesternChart;
  b: WesternChart;
  /** a 盤星體(Aspect.a)對 b 盤星體(Aspect.b),依偏離由小到大 */
  aspects: Aspect<BodyKey>[];
}

export function computeSynastry(a: WesternRequest, b: WesternRequest): SynastryResult {
  const ca = computeWesternChart(a);
  const cb = computeWesternChart(b);
  return { a: ca, b: cb, aspects: synastryAspects(ca.planets, cb.planets) };
}
