/**
 * video-cost.ts — 影片生成「流程 + 每支成本」單一真相源（SSOT）。
 *
 * 一份宣告式 `VIDEO_PIPELINE_STEPS` 同時驅動兩件事：
 *   ① /tools/video 頁面的流程顯示（用到哪些工具、依序）
 *   ② 每支影片的精確成本（沿用 /ops/costs 的 cost-model 定價，不另立一套價）
 *
 * 可擴充 / 可刪減（對齊積木契約）：
 *   - 新增一步 = 在陣列加一筆 → 流程多一格、成本自動含入
 *   - 移除一步 = 刪該筆 或 設 enabled:false → 流程與成本同時不計
 *
 * 定價來源唯一：`lib/ai/cost-model.ts`（TEXT_FEATURES / IMAGE_RATES / TWD_RATE）。改價只動那檔。
 */
import { TEXT_FEATURES, IMAGE_RATES, DEFAULT_IMAGE_MODEL } from "../../ai/cost-model";
import { featureUnitCostUsd, imageCostUsd, usdToNtd } from "../../ai/cost-calculator";

/** 一步的成本如何隨設定縮放。 */
export type StepCostKind =
  | { kind: "text-feature"; featureKey: string }   // 一次性文字呼叫，用 cost-model 的 token profile
  | { kind: "image-per-custom-scene" }             // × 自訂(Flux)場景數，用選定 image model 單價
  | { kind: "free" };                              // Pexels / Edge TTS / ffmpeg / wp-bridge = $0

export interface VideoPipelineStep {
  id: string;
  label: string;        // 顯示名（繁中）
  tool: string;         // 用什麼工具 / 模型
  vendor: string;
  icon: string;
  cost: StepCostKind;
  enabled: boolean;     // false = 註冊但不計（刪整筆 = 徹底移除）
  note?: string;
}

/**
 * 影片生成流程 SSOT。順序即流程順序。
 * 想加步驟（如「背景音樂」「字幕翻譯」「升頻」）→ 在此加一筆並給 cost；想關 → enabled:false 或刪除。
 */
export const VIDEO_PIPELINE_STEPS: VideoPipelineStep[] = [
  { id: "script",  label: "腳本生成",     tool: "Claude Sonnet 4.6", vendor: "Anthropic",      icon: "📝", cost: { kind: "text-feature", featureKey: "video-script" }, enabled: true, note: "主題/文章 → 6 場景旁白 + 視覺提示" },
  { id: "image",   label: "自訂場景圖",   tool: "FLUX schnell",      vendor: "BFL/Replicate",  icon: "🎨", cost: { kind: "image-per-custom-scene" },                  enabled: true, note: "每個 custom 場景一張 AI 插圖" },
  { id: "broll",   label: "實拍 B-roll",  tool: "Pexels 影片庫",     vendor: "Pexels",         icon: "🎞️", cost: { kind: "free" },                                    enabled: true, note: "免費實拍素材（broll 場景）" },
  { id: "tts",     label: "旁白配音",     tool: "Edge TTS 神經語音", vendor: "Microsoft",      icon: "🔊", cost: { kind: "free" },                                    enabled: true, note: "免費中文神經語音" },
  { id: "render",  label: "合成 + 多尺寸", tool: "ffmpeg（自架）",    vendor: "Hetzner",        icon: "🎬", cost: { kind: "free" },                                    enabled: true, note: "Ken Burns/字幕/4 平台尺寸；算力含在月固定基礎" },
  { id: "publish", label: "發佈（選用）", tool: "wp-bridge / YouTube", vendor: "自架/Google",  icon: "🚀", cost: { kind: "free" },                                    enabled: false, note: "預設關；WordPress 走 wp-bridge 簽章" },
];

export interface VideoCostConfig {
  totalScenes: number;
  /** Flux 生圖的場景數（唯一付費項）。 */
  customScenes: number;
  /** Pexels 實拍的場景數（免費）。 */
  brollScenes: number;
  /** 生圖模型 id（cost-model IMAGE_RATES 的鍵）；預設 flux-schnell。 */
  imageModel?: string;
  /** 輸出格式數（每格式各生一組原生圖 → 自訂 AI 圖成本 ×此數）。預設 1。 */
  formatCount?: number;
  /** 前製腳本接力時文字腳本已產生，影片生產區不應重複計腳本生成成本。 */
  includeScriptCost?: boolean;
}

export interface VideoCostLine {
  id: string; label: string; tool: string; vendor: string; icon: string;
  unitUsd: number; count: number; totalUsd: number; free: boolean; note?: string;
}

export interface VideoCostBreakdown {
  lines: VideoCostLine[];
  totalUsd: number;
  totalNtd: number;
  imageModel: string;
  imageModelLabel: string;
}

/**
 * 計算一支影片的精確成本明細（沿用 cost-model 定價）。
 * @param cfg   場景組成（總數 / 自訂圖數 / B-roll 數）+ 生圖模型
 * @param steps 流程步驟（預設 VIDEO_PIPELINE_STEPS；傳入自訂陣列即可試算加/刪步驟）
 *
 * 注意：image 成本以「規劃的 customScenes」計；若某 broll 場景 Pexels 找不到而降級到 Flux，
 * 實際成本會略高 — 估算採規劃值，UI 標註此假設。
 */
export function computeVideoCost(
  cfg: VideoCostConfig,
  steps: VideoPipelineStep[] = VIDEO_PIPELINE_STEPS,
): VideoCostBreakdown {
  const imageModel = cfg.imageModel ?? DEFAULT_IMAGE_MODEL;
  const featureByKey = new Map(TEXT_FEATURES.map((f) => [f.key, f]));
  const lines: VideoCostLine[] = [];

  for (const step of steps) {
    if (!step.enabled) continue;
    if (step.id === "script" && cfg.includeScriptCost === false) continue;
    let unitUsd = 0;
    let count = 1;

    if (step.cost.kind === "text-feature") {
      const f = featureByKey.get(step.cost.featureKey);
      unitUsd = f ? featureUnitCostUsd(f) : 0;
      count = 1;
    } else if (step.cost.kind === "image-per-custom-scene") {
      unitUsd = imageCostUsd(imageModel);
      // 每格式各生一組原生 AI 圖 → 自訂場景數 × 格式數。
      count = Math.max(0, cfg.customScenes) * Math.max(1, cfg.formatCount ?? 1);
    } else {
      // free：count 取場景數以利顯示（unit=0 → total=0）
      unitUsd = 0;
      count = step.id === "broll" ? cfg.brollScenes : step.id === "tts" ? cfg.totalScenes : 1;
    }

    lines.push({
      id: step.id, label: step.label, tool: step.tool, vendor: step.vendor, icon: step.icon,
      unitUsd, count, totalUsd: unitUsd * count, free: unitUsd === 0, note: step.note,
    });
  }

  const totalUsd = lines.reduce((s, l) => s + l.totalUsd, 0);
  return {
    lines,
    totalUsd,
    totalNtd: usdToNtd(totalUsd),
    imageModel,
    imageModelLabel: (IMAGE_RATES[imageModel] ?? IMAGE_RATES[DEFAULT_IMAGE_MODEL]).label,
  };
}
