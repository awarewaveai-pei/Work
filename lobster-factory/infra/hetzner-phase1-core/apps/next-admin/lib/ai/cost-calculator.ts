/**
 * Cost calculator — pure functions over cost-model.ts. No I/O, fully unit-testable.
 *
 * Three jobs:
 *  1. textCallCostUsd  — exact USD for one text call from its token usage (the real-data path:
 *                        every Anthropic response carries usage; logAiCall feeds it here).
 *  2. featureUnitCostUsd / imageCostUsd / toolCostUsd — per-action unit cost (the rate-table path).
 *  3. estimateMonthly  — slider path: usage assumptions × unit costs → a full monthly breakdown,
 *                        in all three dimensions the operator asked for (per-feature, per-volume,
 *                        per-active-client).
 */
import {
  TEXT_RATES,
  FALLBACK_TEXT_MODEL,
  IMAGE_RATES,
  DEFAULT_IMAGE_MODEL,
  TOOL_RATES,
  TEXT_FEATURES,
  INFRA_MONTHLY,
  TWD_RATE,
  type FeatureProfile,
  type TextRate,
} from "./cost-model";

export const usdToNtd = (usd: number): number => Math.round(usd * TWD_RATE * 100) / 100;

/** Clamp a token count to a non-negative finite integer (a malformed usage frame could carry NaN). */
const safeTok = (n: number | undefined): number => Math.max(0, Number(n) || 0);

/**
 * Resolve the rate for a model id, tolerating the dated/normalized id the API ECHOES back (which can
 * differ from the alias the code SENT — e.g. send `claude-sonnet-4-6`, get `claude-sonnet-4-6-20260101`).
 * Without this, a dated Opus/Fable/GPT id would miss the table and be silently mispriced at the Sonnet
 * fallback rate. `fallback: true` signals an unpriced model so callers can flag it instead of hiding it.
 */
export function resolveTextRate(model: string): { rate: TextRate; matchedKey: string; fallback: boolean } {
  if (TEXT_RATES[model]) return { rate: TEXT_RATES[model], matchedKey: model, fallback: false };
  // Anthropic dates as -20260101, OpenAI as -2024-07-18.
  const undated = model.replace(/-(\d{8}|\d{4}-\d{2}-\d{2})$/, "");
  if (TEXT_RATES[undated]) return { rate: TEXT_RATES[undated], matchedKey: undated, fallback: false };
  // Longest key wins: "gpt-4o-mini-x" must not take the gpt-4o row (nor gpt-5.4-mini-x the gpt-5.4 row).
  const prefix = Object.keys(TEXT_RATES).filter((k) => model.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  if (prefix) return { rate: TEXT_RATES[prefix], matchedKey: prefix, fallback: false };
  return { rate: TEXT_RATES[FALLBACK_TEXT_MODEL], matchedKey: FALLBACK_TEXT_MODEL, fallback: true };
}

/** Exact USD for one text call. cacheRead/cacheWrite optional; unknown model → fallback rate. */
export function textCallCostUsd(args: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}): number {
  const { rate } = resolveTextRate(args.model);
  const inM = rate.inputPerM / 1_000_000;
  const outM = rate.outputPerM / 1_000_000;
  const cost =
    safeTok(args.inputTokens) * inM +
    safeTok(args.outputTokens) * outM +
    safeTok(args.cacheReadTokens) * inM * rate.cacheReadMult +
    safeTok(args.cacheWriteTokens) * inM * rate.cacheWriteMult;
  return cost;
}

/** Per-image USD; unknown model → default (flux-schnell). */
export function imageCostUsd(model: string): number {
  return (IMAGE_RATES[model] ?? IMAGE_RATES[DEFAULT_IMAGE_MODEL]).usd;
}

/** Per-run USD for a studio tool (bg-remove / upscale / inpaint / printful-mockup). */
export function toolCostUsd(key: string): number {
  return TOOL_RATES[key]?.usd ?? 0;
}

/** Unit cost of one text feature call from its typical-token profile (rate-table path). */
export function featureUnitCostUsd(f: FeatureProfile): number {
  return textCallCostUsd({ model: f.model, inputTokens: f.inputTok, outputTokens: f.outputTok }) + (f.extraUsd ?? 0);
}

/** A single line in the monthly estimate breakdown. */
export interface CostLine {
  key: string;
  label: string;
  unitUsd: number;
  count: number;
  totalUsd: number;
}

export interface MonthlyEstimate {
  textLines: CostLine[];
  imageLines: CostLine[];
  infraLines: CostLine[];
  textUsd: number;
  imageUsd: number;
  toolUsd: number;
  infraUsd: number;
  totalUsd: number;
  totalNtd: number;
}

/**
 * Slider inputs. All optional — omitted = 0. Three dimensions, mixable:
 *  - perFeatureCalls: explicit calls/month per text feature key (finest grain)
 *  - articles / images / clients: coarse volume knobs (the headline sliders)
 *  - imageModel: which image model the volume images use (default flux-schnell)
 *  - includeInfra: fold the monthly infra baseline into the total
 *
 * When `articles` is set it expands into the feature mix a typical article run triggers
 * (outline + title + keywords + the article itself), so the coarse knob and the fine knob compose.
 * `clients` multiplies a per-client monthly bundle (articles + images) — the report-pricing view.
 */
export interface EstimateInput {
  perFeatureCalls?: Record<string, number>;
  articles?: number;
  imagesPerArticle?: number;
  images?: number;
  imageModel?: string;
  clients?: number;
  articlesPerClient?: number;
  imagesPerClient?: number;
  toolRuns?: Record<string, number>;
  includeInfra?: boolean;
}

/** Feature keys a single article-generation run typically fires (besides the article itself). */
const ARTICLE_COMPANION_FEATURES = ["outline", "title", "keywords"];

export function estimateMonthly(input: EstimateInput): MonthlyEstimate {
  const featureByKey = new Map(TEXT_FEATURES.map((f) => [f.key, f]));

  // Aggregate per-feature call counts from all three dimensions.
  const calls = new Map<string, number>();
  const addCalls = (key: string, n: number) => calls.set(key, (calls.get(key) ?? 0) + n);

  for (const [k, n] of Object.entries(input.perFeatureCalls ?? {})) addCalls(k, n);

  const directArticles = input.articles ?? 0;
  const clientArticles = (input.clients ?? 0) * (input.articlesPerClient ?? 0);
  const totalArticles = directArticles + clientArticles;
  if (totalArticles > 0) {
    addCalls("article", totalArticles);
    for (const c of ARTICLE_COMPANION_FEATURES) addCalls(c, totalArticles);
  }

  const textLines: CostLine[] = [];
  for (const [key, count] of calls) {
    const f = featureByKey.get(key);
    if (!f || count <= 0) continue;
    const unitUsd = featureUnitCostUsd(f);
    textLines.push({ key, label: f.label, unitUsd, count, totalUsd: unitUsd * count });
  }

  // Image volume: direct + per-article + per-client.
  const imageModel = input.imageModel ?? DEFAULT_IMAGE_MODEL;
  const articleImages = totalArticles * (input.imagesPerArticle ?? 0);
  const clientImages = (input.clients ?? 0) * (input.imagesPerClient ?? 0);
  const totalImages = (input.images ?? 0) + articleImages + clientImages;
  const imageLines: CostLine[] = [];
  if (totalImages > 0) {
    const unitUsd = imageCostUsd(imageModel);
    imageLines.push({
      key: imageModel,
      label: (IMAGE_RATES[imageModel] ?? IMAGE_RATES[DEFAULT_IMAGE_MODEL]).label,
      unitUsd,
      count: totalImages,
      totalUsd: unitUsd * totalImages,
    });
  }

  // Studio tool runs.
  let toolUsd = 0;
  for (const [key, count] of Object.entries(input.toolRuns ?? {})) {
    if (count > 0) toolUsd += toolCostUsd(key) * count;
  }

  const infraLines: CostLine[] = input.includeInfra
    ? INFRA_MONTHLY.map((i) => ({ key: i.key, label: i.label, unitUsd: i.usdPerMonth, count: 1, totalUsd: i.usdPerMonth }))
    : [];

  const textUsd = textLines.reduce((s, l) => s + l.totalUsd, 0);
  const imageUsd = imageLines.reduce((s, l) => s + l.totalUsd, 0);
  const infraUsd = infraLines.reduce((s, l) => s + l.totalUsd, 0);
  const totalUsd = textUsd + imageUsd + toolUsd + infraUsd;

  return {
    textLines: textLines.sort((a, b) => b.totalUsd - a.totalUsd),
    imageLines,
    infraLines,
    textUsd,
    imageUsd,
    toolUsd,
    infraUsd,
    totalUsd,
    totalNtd: usdToNtd(totalUsd),
  };
}
