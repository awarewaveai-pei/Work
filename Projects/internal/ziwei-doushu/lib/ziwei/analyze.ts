import type { IFunctionalAstrolabe } from 'iztro/lib/astro/FunctionalAstrolabe';
import { detectPatterns, type ZiweiPattern, type PatternKind } from './patterns';
import { analyzeBrightness, type ZiweiBrightness } from './brightness';
import { analyzeFlying, type FlyingStatement } from './flying';
import { analyzePalaceReadings, type PalaceReading } from './palaceReading';

/**
 * 紫微頂規分析總成 — 確定性命格分析。
 *   格局 + 主星亮度吉凶 + 飛宮四化 + 十二宮逐星解讀。
 * 由 ZiweiTool 在 client 端對排好的命盤計算,既渲染分析區塊,也餵給 AI 做深度簡批。
 */
export interface ZiweiAnalysis {
  patterns: ZiweiPattern[];
  brightness: ZiweiBrightness;
  flying: FlyingStatement[];
  /** 十二宮逐星逐宮解讀(知識庫驅動) */
  palaceReadings: PalaceReading[];
}

export function analyzeZiwei(astro: IFunctionalAstrolabe): ZiweiAnalysis {
  return {
    patterns: detectPatterns(astro),
    brightness: analyzeBrightness(astro),
    flying: analyzeFlying(astro),
    palaceReadings: analyzePalaceReadings(astro),
  };
}

export type {
  ZiweiPattern,
  PatternKind,
  ZiweiBrightness,
  FlyingStatement,
  PalaceReading,
};
export { detectPatterns, analyzeBrightness, analyzeFlying, analyzePalaceReadings };
