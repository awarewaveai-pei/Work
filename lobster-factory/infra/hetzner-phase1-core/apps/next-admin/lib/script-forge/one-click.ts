// 「主題 → 完整腳本」一鍵 (video-unify-plan §12 第 1 級、§13 C8): 手動生成 module's own `script` task, run once
// with the module defaults, no angle picked. Price shown before the click comes from cost-model.ts rates.
import { textCallCostUsd, usdToNtd } from "@/lib/ai/cost-calculator";
import { TEXT_FEATURES } from "@/lib/ai/cost-model";

/** Platform used when none is picked (first on the platform list): decides word count and pace. */
export const ONE_CLICK_PLATFORM = "reels";

// One script call = the `video-script` profile (6 scenes), output scaled by the scene count; plus the scoring call the
// module makes after every script (hook / scene count / cta in, a short score object out).
const SCRIPT = TEXT_FEATURES.find((f) => f.key === "video-script");
const PROFILE_SCENES = 6;
const SCORE_TOKENS = { inputTokens: 300, outputTokens: 250 };

/** Estimated NT$ of one 一鍵 run on `model` (script + score). */
export function oneClickEstimateNtd(model: string, sceneCount: number): number {
  const scenes = Math.max(1, sceneCount || PROFILE_SCENES);
  const script = textCallCostUsd({ model, inputTokens: SCRIPT?.inputTok ?? 1200, outputTokens: Math.round(((SCRIPT?.outputTok ?? 2200) * scenes) / PROFILE_SCENES) });
  return usdToNtd(script + textCallCostUsd({ model, ...SCORE_TOKENS }));
}

/** 「約 NT$1.6」: one decimal, never below NT$0.1. */
export function formatNtd(ntd: number): string {
  return `約 NT$${Math.max(0.1, Math.round(ntd * 10) / 10).toFixed(1)}`;
}
