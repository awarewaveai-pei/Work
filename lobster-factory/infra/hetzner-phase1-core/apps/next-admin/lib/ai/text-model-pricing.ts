import { TEXT_RATES, TWD_RATE } from "./cost-model";
import type { AiTextModel } from "./text-model-options";

function formatNtPer1k(usdPerM: number): string {
  const ntPer1k = (usdPerM * TWD_RATE) / 1000;
  if (ntPer1k < 0.01) return `NT$${ntPer1k.toFixed(3)}`;
  if (ntPer1k < 1) return `NT$${ntPer1k.toFixed(2)}`;
  return `NT$${ntPer1k.toFixed(1)}`;
}

export function textModelCostLabel(model: AiTextModel): string {
  const rate = TEXT_RATES[model];
  if (!rate) return "未定價";
  return `${formatNtPer1k(rate.inputPerM)}/1K in · ${formatNtPer1k(rate.outputPerM)}/1K out`;
}

export function textModelCostSummary(model: AiTextModel): string {
  const rate = TEXT_RATES[model];
  if (!rate) return "依供應商實際用量計費";
  return `${rate.vendor} · input $${rate.inputPerM}/1M · output $${rate.outputPerM}/1M`;
}
