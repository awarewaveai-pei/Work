// What one monthly plan costs, from the cost model (TEXT_FEATURES "content-plan"), so the button shows it before anyone
// presses it (memory: AI only on a button with its cost). Browser-safe: no server imports.
import { featureUnitCostUsd, textCallCostUsd } from "@/lib/ai/cost-calculator";
import { isAiTextModel, isTextChain } from "@/lib/ai/text-model-options";
import { TEXT_FEATURES, TWD_RATE } from "@/lib/ai/cost-model";
import { articleBodyImages, articleImageUsd } from "@/lib/content/image/article-image";
import { MAX_WRITER_CALLS } from "@/lib/social/write-posts";
import { articleVideoCostUsd } from "@/lib/content/video/defaults";

/** Body images per automatic article (it is written at the default size, so 4: articleBodyImages): the article writes
 *  this many placeholders (make.ts) and the price below counts them, plus the cover -- one constant, so the estimate
 *  cannot drift from what is made (U11.5: 3 images were the gap between NT$7.4 shown and NT$10.2 spent). */
export const TOPIC_ARTICLE_IMAGES = articleBodyImages();
/** K10: the cover is its own picture (its own scene), not the first body image. */
export const TOPIC_COVER_IMAGES = 1;

/** A topic's median real spend (actual-cost.ts) replaces the price-list estimate once this many finished topics have one. */
export const ACTUAL_MIN_TOPICS = 5;
export const ACTUAL_WINDOW_DAYS = 30;

export function planCostTwd(): number {
  const f = TEXT_FEATURES.find((x) => x.key === "content-plan");
  if (!f) throw new Error("cost-model has no content-plan feature");
  return Math.ceil(featureUnitCostUsd(f) * TWD_RATE * 10) / 10;
}

/** One day's trend scoring of one site (daily.ts, the cheap model), NT$. */
export function dailyCostTwd(): number {
  const f = TEXT_FEATURES.find((x) => x.key === "content-daily");
  if (!f) throw new Error("cost-model has no content-daily feature");
  return Math.ceil(featureUnitCostUsd(f) * TWD_RATE * 10) / 10;
}

/** Card K7: the site's text road as the price reads it (SiteContentDefaults textChain / textApiModel); K10: and its
 *  imageModel, which prices the article's images. */
export interface TopicTextRoad { textChain?: unknown; textApiModel?: unknown; imageModel?: unknown }

/** The article call's model part, USD: the feature's estimate on the site's API model (none set = the feature's own). */
export function articleModelUsd(road?: TopicTextRoad): number {
  const f = TEXT_FEATURES.find((x) => x.key === "article");
  if (!f) throw new Error("cost-model has no article feature");
  return textCallCostUsd({ model: isAiTextModel(road?.textApiModel) ? road.textApiModel : f.model, inputTokens: f.inputTok, outputTokens: f.outputTok });
}
/** A road whose first segments are subscriptions: the article text is NT$0 unless they all fail and the API writes it. */
export const subFirst = (road?: TopicTextRoad) => isTextChain(road?.textChain) && road.textChain !== "api";

/** One topic made by the pipeline, in USD, for the formats it makes (default article + social): the article with its
 *  images (TOPIC_ARTICLE_IMAGES + the cover, on the site's image model), the social rewrite (max = with the one shorter rewrite) and the video at the article page's default settings.
 *  `road` (K7): the article on the site's API model; a road starting on a subscription leaves the article text out of
 *  the usual and keeps it in the max (the API writes it when the subscriptions cannot). */
export function topicCostUsd(formats: readonly string[] = ["article", "social"], road?: TopicTextRoad): { usual: number; max: number } {
  const unit = (key: string) => {
    const f = TEXT_FEATURES.find((x) => x.key === key);
    if (!f) throw new Error(`cost-model has no ${key} feature`);
    return featureUnitCostUsd(f);
  };
  const round = (usd: number) => Math.ceil(usd * 100) / 100;
  const hasArticle = formats.includes("article");
  const swap = hasArticle && road ? articleModelUsd(road) - articleModelUsd() : 0;   // no road = the feature's own price, as before
  const article = hasArticle ? unit("article") + swap + (TOPIC_ARTICLE_IMAGES + TOPIC_COVER_IMAGES) * articleImageUsd(road?.imageModel) : 0;
  const saved = hasArticle && subFirst(road) ? articleModelUsd(road) : 0;
  const social = formats.includes("social") || formats.includes("youtube") ? unit("syndicate") : 0;   // youtube's text is written too
  const video = formats.includes("video") || formats.includes("youtube") ? articleVideoCostUsd() : 0;
  return { usual: round(article - saved + social + video), max: round(article + social * MAX_WRITER_CALLS + video) };
}

/** The same, in NT$ for the topic page's button. */
export function topicCostTwd(formats?: readonly string[], road?: TopicTextRoad): { usual: number; max: number } {
  const { usual, max } = topicCostUsd(formats, road);
  const twd = (usd: number) => Math.ceil(usd * TWD_RATE * 10) / 10;
  return { usual: twd(usual), max: twd(max) };
}

/** K7: the topic page's line for a road starting on a subscription; null for an API-only road. */
export function subRoadNote(road?: TopicTextRoad): string | null {
  return subFirst(road) ? `文章走訂閱 NT$0，訂閱不可用時最多 NT$${Math.ceil(articleModelUsd(road) * TWD_RATE * 10) / 10}` : null;
}

const DEFAULT_FORMATS = ["article", "social"] as const;
/** The key a brand's actual costs are grouped by: the topic's formats as a set. */
export const formatsKey = (formats: readonly string[]): string => [...new Set(formats)].sort().join("+");

/** What this brand's recent finished topics really cost (actual-cost.ts): the median in NT$ and how many topics it is from. */
export interface TopicActual { twd: number; n: number }

/** The price a page shows for one topic (`byFormats` = recentTopicActual's result): the median of the last 30 days' real spend once ACTUAL_MIN_TOPICS finished
 *  topics have one, else the price-list estimate; `basis` says which, so the page can name it. The most is never below
 *  the usual. A subscription-first road (K7) always shows the price list: the median mixes API-written topics in. */
export function topicShownTwd(formats?: readonly string[], byFormats?: Record<string, TopicActual> | null, road?: TopicTextRoad): { usual: number; max: number; basis: "actual" | "list"; n: number } {
  const list = topicCostTwd(formats, road);
  // only topics made with the same formats (an article-only price is not a video one)
  const actual = subFirst(road) && (formats ?? DEFAULT_FORMATS).includes("article") ? undefined : byFormats?.[formatsKey(formats ?? DEFAULT_FORMATS)];
  if (actual && actual.n >= ACTUAL_MIN_TOPICS && Number.isFinite(actual.twd) && actual.twd > 0) {
    const usual = Math.ceil(actual.twd * 10) / 10;
    return { usual, max: Math.max(list.max, usual), basis: "actual", n: actual.n };
  }
  return { ...list, basis: "list", n: 0 };
}

export const costBasisNote = (basis: "actual" | "list", n: number) =>
  basis === "actual" ? `近 ${ACTUAL_WINDOW_DAYS} 天 ${n} 題實際花費的中位數` : "價目表估價";
