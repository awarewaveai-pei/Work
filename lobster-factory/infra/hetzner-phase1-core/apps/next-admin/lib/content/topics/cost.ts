// What one monthly plan costs, from the cost model (TEXT_FEATURES "content-plan"), so the button shows it before anyone
// presses it (memory: AI only on a button with its cost). Browser-safe: no server imports.
import { featureUnitCostUsd } from "@/lib/ai/cost-calculator";
import { TEXT_FEATURES, TWD_RATE } from "@/lib/ai/cost-model";
import { MAX_WRITER_CALLS } from "@/lib/social/write-posts";

export function planCostTwd(): number {
  const f = TEXT_FEATURES.find((x) => x.key === "content-plan");
  if (!f) throw new Error("cost-model has no content-plan feature");
  return Math.ceil(featureUnitCostUsd(f) * TWD_RATE * 10) / 10;
}

/** One topic made by the pipeline, in USD, for the formats it makes (default both): the article and/or the social rewrite
 *  (max = with the one shorter rewrite). Video formats are priced by their own phase. */
export function topicCostUsd(formats: readonly string[] = ["article", "social"]): { usual: number; max: number } {
  const unit = (key: string) => {
    const f = TEXT_FEATURES.find((x) => x.key === key);
    if (!f) throw new Error(`cost-model has no ${key} feature`);
    return featureUnitCostUsd(f);
  };
  const round = (usd: number) => Math.ceil(usd * 100) / 100;
  const article = formats.includes("article") ? unit("article") : 0;
  const social = formats.includes("social") ? unit("syndicate") : 0;
  return { usual: round(article + social), max: round(article + social * MAX_WRITER_CALLS) };
}

/** The same, in NT$ for the topic page's button. */
export function topicCostTwd(formats?: readonly string[]): { usual: number; max: number } {
  const { usual, max } = topicCostUsd(formats);
  const twd = (usd: number) => Math.ceil(usd * TWD_RATE * 10) / 10;
  return { usual: twd(usual), max: twd(max) };
}
