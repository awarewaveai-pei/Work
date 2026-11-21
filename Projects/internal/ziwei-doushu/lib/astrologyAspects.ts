/**
 * 西洋占星本命盤相位 — 純函式，client/server 共用（不碰 wasm）。
 *
 * 規則（主流本命盤口徑；數值參考 Kerykeion 預設值、openephem、flatlib，程式自行重寫）：
 * - 五種主要相位：合 0°、六合 60°、刑 90°、拱 120°、沖 180°。
 * - 容許度：合／沖／拱／刑 6°，六合 5°；日或月參與時 +1.5°（兩顆都在只加一次）。邊界含（偏離 = 容許度算成立）。
 * - 角距取最短弧（0–180°，359° 與 1° 相距 2°）。同時符合多個相位時取偏離最小者。
 * - 納入的點：`WesternChart.planets` 全部（十大行星＋北交點＋凱龍星）。
 *   上升、天頂不納入：出生時間差 4 分鐘就移動約 1°，且 XALEN 不回傳其速度，無法判入相／出相。
 * - 入相／出相：用 XALEN `planetPositionJson` 的 `lon_speed`（度／日）算偏離的變化率；
 *   變小 = 入相（applying），變大 = 出相（separating），速度缺或偏離正好 0 = null。
 */

export const ASPECT_TYPES = [
  { key: 'conjunction', angle: 0, orb: 6 },
  { key: 'sextile', angle: 60, orb: 5 },
  { key: 'square', angle: 90, orb: 6 },
  { key: 'trine', angle: 120, orb: 6 },
  { key: 'opposition', angle: 180, orb: 6 },
] as const;

export type AspectKey = (typeof ASPECT_TYPES)[number]['key'];

export interface AspectType {
  key: AspectKey;
  angle: number;
  orb: number;
}

/** 日或月參與時加寬的容許度（容許度改動時同步 messages/*.json 的 astrology.aspectsNote） */
export const LUMINARY_ORB_BONUS = 1.5;

export interface AspectPoint<B extends string = string> {
  body: B;
  /** 黃道經度（度） */
  longitude: number;
  /** 黃經速度（度／日）；缺則不判入相／出相 */
  speed?: number;
}

export interface Aspect<B extends string = string> {
  a: B;
  b: B;
  aspect: AspectKey;
  /** 實際偏離準確相位的度數（≥0） */
  orb: number;
  /** true 入相、false 出相、null 無法判定 */
  applying: boolean | null;
}

const LUMINARIES = new Set(['sun', 'moon']);

/** 兩經度的最短弧（0–180） */
export function separation(lonA: number, lonB: number): number {
  const d = (((lonB - lonA) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

/** 有號角差 b−a，正規化到 (−180, 180] */
function signedDiff(lonA: number, lonB: number): number {
  const d = (((lonB - lonA) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

function applyingOf(a: AspectPoint, b: AspectPoint, angle: number): boolean | null {
  if (!Number.isFinite(a.speed) || !Number.isFinite(b.speed)) return null;
  const diff = signedDiff(a.longitude, b.longitude);
  const sep = Math.abs(diff);
  // d(sep)/dt = sign(diff)·(vB − vA)；d(orb)/dt = sign(sep − angle)·d(sep)/dt
  const rate = Math.sign(sep - angle) * Math.sign(diff) * (b.speed! - a.speed!);
  if (rate === 0) return null;
  return rate < 0;
}

/** 角距 sep 對應的最近相位（容許度 = 該相位 orb + bonus，邊界含）；不成立回 null */
function matchAspect(
  sep: number,
  bonus: number,
  types: readonly AspectType[],
): { key: AspectKey; angle: number; orb: number } | null {
  let best: { key: AspectKey; angle: number; orb: number } | null = null;
  for (const t of types) {
    const dev = Math.abs(sep - t.angle);
    if (dev <= t.orb + bonus && (best === null || dev < best.orb)) {
      best = { key: t.key, angle: t.angle, orb: dev };
    }
  }
  return best;
}

function luminaryBonus(a: string, b: string, bonus: number): number {
  return LUMINARIES.has(a) || LUMINARIES.has(b) ? bonus : 0;
}

/**
 * 回傳所有成立的主要相位，依偏離度數由小到大排序。
 * `types` 預設 ASPECT_TYPES（容許度互不重疊）；自訂較寬容許度時重疊者取偏離最小。
 */
export function computeAspects<B extends string>(
  points: readonly AspectPoint<B>[],
  types: readonly AspectType[] = ASPECT_TYPES,
): Aspect<B>[] {
  const out: Aspect<B>[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const p = points[i];
      const q = points[j];
      const best = matchAspect(
        separation(p.longitude, q.longitude),
        luminaryBonus(p.body, q.body, LUMINARY_ORB_BONUS),
        types,
      );
      if (best) {
        out.push({ a: p.body, b: q.body, aspect: best.key, orb: best.orb, applying: applyingOf(p, q, best.angle) });
      }
    }
  }
  return out.sort((x, y) => x.orb - y.orb);
}

/**
 * 兩張盤之間的相位（行運對本命、合盤）：a 盤每點對 b 盤每點，不含盤內配對；依偏離由小到大。
 * `a`／`b` 分別是 a 盤、b 盤的星體（兩盤同名星體各自獨立）。
 * 入相／出相：兩邊都給速度才判（行運把本命速度設 0）；任一邊缺速度 = null。
 */
export function computeCrossAspects<A extends string, B extends string>(
  as: readonly AspectPoint<A>[],
  bs: readonly AspectPoint<B>[],
  opts: { types?: readonly AspectType[]; luminaryBonus?: number } = {},
): Aspect<A | B>[] {
  const types = opts.types ?? ASPECT_TYPES;
  const bonus = opts.luminaryBonus ?? LUMINARY_ORB_BONUS;
  const out: Aspect<A | B>[] = [];
  for (const p of as) {
    for (const q of bs) {
      const best = matchAspect(separation(p.longitude, q.longitude), luminaryBonus(p.body, q.body, bonus), types);
      if (best) {
        out.push({ a: p.body, b: q.body, aspect: best.key, orb: best.orb, applying: applyingOf(p, q, best.angle) });
      }
    }
  }
  return out.sort((x, y) => x.orb - y.orb);
}
