/**
 * 行運與太陽回歸 — 純函式，client/server 共用（不碰 wasm；星曆由呼叫端注入）。
 *
 * 規則（數值參考 Kerykeion PREDICTIVE_ACTIVE_ASPECTS、openephem `aspects.py` between／`returns.py` find_return，程式自行重寫）：
 * - 行運：今天的十二星體對本命十二星體的五種主要相位，容許度一律 3°，日月不加寬。
 *   入相／出相：行運星用 XALEN 黃經速度，本命星速度 0（本命盤不動）。
 *   「今天」= 使用者時區的今天（lib/today.ts localToday）當地正午；月亮一天走約 13°，故月亮行運只代表當天大概位置。
 * - 太陽回歸：太陽回到本命太陽黃經的時刻；牛頓法（數值導數），收斂到 1e-7°（遠小於 1 角秒 ≈ 2.8e-4°）。
 */
import {
  computeCrossAspects,
  type Aspect,
  type AspectPoint,
  type AspectType,
} from './astrologyAspects';

export const TRANSIT_ORB = 3;

export const TRANSIT_ASPECT_TYPES: readonly AspectType[] = [
  { key: 'conjunction', angle: 0, orb: TRANSIT_ORB },
  { key: 'sextile', angle: 60, orb: TRANSIT_ORB },
  { key: 'square', angle: 90, orb: TRANSIT_ORB },
  { key: 'trine', angle: 120, orb: TRANSIT_ORB },
  { key: 'opposition', angle: 180, orb: TRANSIT_ORB },
];

/** 行運相位：a = 行運星（帶速度），b = 本命星（速度一律視為 0）。 */
export function transitAspects<B extends string>(
  transit: readonly AspectPoint<B>[],
  natal: readonly AspectPoint<B>[],
): Aspect<B>[] {
  return computeCrossAspects(
    transit,
    natal.map((p) => ({ body: p.body, longitude: p.longitude, speed: 0 })),
    { types: TRANSIT_ASPECT_TYPES, luminaryBonus: 0 },
  );
}

/** 有號角差 to−from，(−180, 180] */
function signedDelta(from: number, to: number): number {
  const d = (((to - from) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

/** 回歸收斂門檻（度） */
export const RETURN_TOLERANCE_DEG = 1e-7;

/**
 * 某天體黃經回到 targetLon、離 jdNear 最近的時刻（JD UT）。
 * lonAt(jd) 回傳黃經（度）。太陽每天約走 1°，jdNear 給生日附近即可落在同一次回歸。
 */
export function findReturnJd(
  lonAt: (jd: number) => number,
  targetLon: number,
  jdNear: number,
  maxIter = 50,
): number {
  let jd = jdNear;
  for (let i = 0; i < maxIter; i++) {
    const d = signedDelta(targetLon, lonAt(jd));
    if (Math.abs(d) <= RETURN_TOLERANCE_DEG) return jd;
    const h = 0.01;
    const v = signedDelta(lonAt(jd - h), lonAt(jd + h)) / (2 * h);
    if (!Number.isFinite(v) || Math.abs(v) < 1e-9) throw new Error('return: body not moving');
    jd -= d / v;
  }
  throw new Error('return did not converge');
}

export interface DateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** JD（UT）→ 指定時區的日期時間（分鐘四捨五入）。格里曆，適用 1583 年後。 */
export function jdToDateTime(jd: number, tzOffsetHours: number): DateTimeParts {
  const ms = Math.round(((jd - 2440587.5) * 1440 + tzOffsetHours * 60)) * 60000;
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}
