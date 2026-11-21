/**
 * 合盤（synastry）— 純函式，client/server 共用。
 *
 * 規則：甲方十二星體對乙方十二星體的五種主要相位，容許度沿用本命口徑（合／沖／拱／刑 6°、六合 5°，日月參與 +1.5°，
 * 見 lib/astrologyAspects.ts），不判入相／出相（兩張出生盤都不動）。
 * 合盤計分（Discepolo 制）不採用：出處只有網址，Kerykeion 的 v1 與 v2 兩版計分互相矛盾。
 */
import { computeCrossAspects, type Aspect, type AspectPoint } from './astrologyAspects';

export function synastryAspects<B extends string>(
  a: readonly AspectPoint<B>[],
  b: readonly AspectPoint<B>[],
): Aspect<B>[] {
  const still = (p: AspectPoint<B>) => ({ body: p.body, longitude: p.longitude });
  return computeCrossAspects(a.map(still), b.map(still));
}
