import { initSync, XalenWasm } from '@xalen/wasm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
}

export interface WesternChart {
  jd: number;
  ascendant: { longitude: number; signIndex: number };
  mc: { longitude: number; signIndex: number };
  /** 12 宮頭黃道度 */
  houseCusps: number[];
  planets: WesternPlanet[];
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

/** 行星黃道經度落在哪一宮(Placidus 宮頭不等分,需逐宮判斷含跨 0° 環繞)。 */
function houseOf(longitude: number, cusps: number[]): number {
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

export function computeWesternChart(req: WesternRequest): WesternChart {
  const w = getXalen();
  const hourUT = req.hour + req.minute / 60 - req.tzOffsetHours;
  const jd = julianDay(req.year, req.month, req.day, hourUT);

  const houses = JSON.parse(w.housesJson(jd, req.lat, req.lon, PLACIDUS)) as {
    cusps: number[];
    ascendant: number;
    mc: number;
  };
  const cusps = houses.cusps;

  const planets: WesternPlanet[] = WESTERN_BODIES.map((b) => {
    const p = JSON.parse(
      w.planetPositionJson(jd, b.id, false, 0),
    ) as { longitude: number; is_retrograde: boolean };
    return {
      body: b.key,
      longitude: p.longitude,
      signIndex: signIndexOf(p.longitude),
      house: houseOf(p.longitude, cusps),
      retrograde: Boolean(p.is_retrograde),
    };
  });

  return {
    jd,
    ascendant: {
      longitude: houses.ascendant,
      signIndex: signIndexOf(houses.ascendant),
    },
    mc: { longitude: houses.mc, signIndex: signIndexOf(houses.mc) },
    houseCusps: cusps,
    planets,
  };
}
