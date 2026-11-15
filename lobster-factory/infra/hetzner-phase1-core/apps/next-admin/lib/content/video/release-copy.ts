// Card VD.9: the release page's social copy. Free first: a ticked channel starts with the video's title and the first
// line of its script (both from media_assets.metadata, written by the workbench's release text); the AI rewrite is a
// button with its price in NT$ from the cost model at the one rate (TEXT_FEATURES "syndicate", TWD_RATE). Browser-safe.
import { featureUnitCostUsd } from "@/lib/ai/cost-calculator";
import { TEXT_FEATURES, TWD_RATE } from "@/lib/ai/cost-model";

/** The free default text for one channel: title, a blank line, the script's first non-empty line (either may be missing). */
export function defaultCopy(title: string | undefined, script: string | undefined): string {
  const t = (title ?? "").trim(), first = (script ?? "").split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  return [t, first && first !== t ? first : ""].filter(Boolean).join("\n\n");
}

/** One AI copy run (all ticked channels in one call) in NT$, rounded up to 0.1. */
export function syndicateCostTwd(): number {
  const f = TEXT_FEATURES.find((x) => x.key === "syndicate");
  if (!f) throw new Error("cost-model has no syndicate feature");
  return Math.ceil(featureUnitCostUsd(f) * TWD_RATE * 10) / 10;
}
