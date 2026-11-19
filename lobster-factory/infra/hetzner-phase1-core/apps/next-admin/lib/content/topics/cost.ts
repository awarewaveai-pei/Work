// What one monthly plan costs, from the cost model (TEXT_FEATURES "content-plan"), so the button shows it before anyone
// presses it (memory: AI only on a button with its cost). Browser-safe: no server imports.
import { featureUnitCostUsd } from "@/lib/ai/cost-calculator";
import { DEFAULT_IMAGE_MODEL, IMAGE_RATES, TEXT_FEATURES, TWD_RATE } from "@/lib/ai/cost-model";
import { MAX_WRITER_CALLS } from "@/lib/social/write-posts";
import { articleVideoCostUsd } from "@/lib/content/video/defaults";

/** Images per automatic article (the cheapest model, ~US$0.003 each): the article writes this many placeholders (make.ts)
 *  and the price below counts them -- one constant, so the estimate cannot drift from what is made (U11.5: 3 images were
 *  the gap between NT$7.4 shown and NT$10.2 spent). */
export const TOPIC_ARTICLE_IMAGES = 3;

/** A topic's median real spend (actual-cost.ts) replaces the price-list estimate once this many finished topics have one. */
export const ACTUAL_MIN_TOPICS = 5;
export const ACTUAL_WINDOW_DAYS = 30;

export function planCostTwd(): number {
  const f = TEXT_FEATURES.find((x) => x.key === "content-plan");
  if (!f) throw new Error("cost-model has no content-plan feature");
  return Math.ceil(featureUnitCostUsd(f) * TWD_RATE * 10) / 10;
}

/** One topic made by the pipeline, in USD, for the formats it makes (default article + social): the article with its
 *  images (TOPIC_ARTICLE_IMAGES), the social rewrite (max = with the one shorter rewrite) and the video at the article page's default settings. */
export function topicCostUsd(formats: readonly string[] = ["article", "social"]): { usual: number; max: number } {
  const unit = (key: string) => {
    const f = TEXT_FEATURES.find((x) => x.key === key);
    if (!f) throw new Error(`cost-model has no ${key} feature`);
    return featureUnitCostUsd(f);
  };
  const round = (usd: number) => Math.ceil(usd * 100) / 100;
  const article = formats.includes("article") ? unit("article") + TOPIC_ARTICLE_IMAGES * (IMAGE_RATES[DEFAULT_IMAGE_MODEL]?.usd ?? 0) : 0;
  const social = formats.includes("social") || formats.includes("youtube") ? unit("syndicate") : 0;   // youtube's text is written too
  const video = formats.includes("video") || formats.includes("youtube") ? articleVideoCostUsd() : 0;
  return { usual: round(article + social + video), max: round(article + social * MAX_WRITER_CALLS + video) };
}

/** The same, in NT$ for the topic page's button. */
export function topicCostTwd(formats?: readonly string[]): { usual: number; max: number } {
  const { usual, max } = topicCostUsd(formats);
  const twd = (usd: number) => Math.ceil(usd * TWD_RATE * 10) / 10;
  return { usual: twd(usual), max: twd(max) };
}

const DEFAULT_FORMATS = ["article", "social"] as const;
/** The key a brand's actual costs are grouped by: the topic's formats as a set. */
export const formatsKey = (formats: readonly string[]): string => [...new Set(formats)].sort().join("+");

/** What this brand's recent finished topics really cost (actual-cost.ts): the median in NT$ and how many topics it is from. */
export interface TopicActual { twd: number; n: number }

/** The price a page shows for one topic (`byFormats` = recentTopicActual's result): the median of the last 30 days' real spend once ACTUAL_MIN_TOPICS finished
 *  topics have one, else the price-list estimate; `basis` says which, so the page can name it. The most is never below
 *  the usual. */
export function topicShownTwd(formats?: readonly string[], byFormats?: Record<string, TopicActual> | null): { usual: number; max: number; basis: "actual" | "list"; n: number } {
  const list = topicCostTwd(formats);
  const actual = byFormats?.[formatsKey(formats ?? DEFAULT_FORMATS)];   // only topics made with the same formats (an article-only price is not a video one)
  if (actual && actual.n >= ACTUAL_MIN_TOPICS && Number.isFinite(actual.twd) && actual.twd > 0) {
    const usual = Math.ceil(actual.twd * 10) / 10;
    return { usual, max: Math.max(list.max, usual), basis: "actual", n: actual.n };
  }
  return { ...list, basis: "list", n: 0 };
}

export const costBasisNote = (basis: "actual" | "list", n: number) =>
  basis === "actual" ? `近 ${ACTUAL_WINDOW_DAYS} 天 ${n} 題實際花費的中位數` : "價目表估價";
