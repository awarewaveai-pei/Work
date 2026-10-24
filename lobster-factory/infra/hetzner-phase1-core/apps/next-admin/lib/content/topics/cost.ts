// What one monthly plan costs, from the cost model (TEXT_FEATURES "content-plan"), so the button shows it before anyone
// presses it (memory: AI only on a button with its cost). Browser-safe: no server imports.
import { featureUnitCostUsd } from "@/lib/ai/cost-calculator";
import { TEXT_FEATURES, TWD_RATE } from "@/lib/ai/cost-model";

export function planCostTwd(): number {
  const f = TEXT_FEATURES.find((x) => x.key === "content-plan");
  if (!f) throw new Error("cost-model has no content-plan feature");
  return Math.ceil(featureUnitCostUsd(f) * TWD_RATE * 10) / 10;
}
