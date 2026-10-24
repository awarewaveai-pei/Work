import { describe, expect, it } from "vitest";
import {
  textCallCostUsd,
  imageCostUsd,
  toolCostUsd,
  featureUnitCostUsd,
  estimateMonthly,
  usdToNtd,
} from "../cost-calculator";
import { FALLBACK_TEXT_MODEL, TEXT_FEATURES, TWD_RATE } from "../cost-model";

describe("textCallCostUsd", () => {
  it("computes sonnet input+output exactly ($3/$15 per 1M)", () => {
    // 1M input @ $3 + 1M output @ $15 = $18
    expect(textCallCostUsd({ model: "claude-sonnet-4-6", inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(18, 6);
  });

  it("computes haiku exactly ($1/$5 per 1M)", () => {
    expect(textCallCostUsd({ model: "claude-haiku-4-5-20251001", inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(6, 6);
  });

  it("computes gpt-5.4-nano exactly ($0.20/$1.25 per 1M)", () => {
    expect(textCallCostUsd({ model: "gpt-5.4-nano", inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(1.45, 6);
  });

  it("applies cache-read multiplier (0.1x input)", () => {
    // 1M cache-read on sonnet = 1M * ($3/1M) * 0.1 = $0.30
    expect(textCallCostUsd({ model: "claude-sonnet-4-6", inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 })).toBeCloseTo(0.3, 6);
  });

  it("applies cache-write multiplier (1.25x input)", () => {
    expect(textCallCostUsd({ model: "claude-sonnet-4-6", inputTokens: 0, outputTokens: 0, cacheWriteTokens: 1_000_000 })).toBeCloseTo(3.75, 6);
  });

  it("falls back to the default model rate for an unknown model", () => {
    const unknown = textCallCostUsd({ model: "made-up-model", inputTokens: 1_000_000, outputTokens: 0 });
    const fallback = textCallCostUsd({ model: FALLBACK_TEXT_MODEL, inputTokens: 1_000_000, outputTokens: 0 });
    expect(unknown).toBeCloseTo(fallback, 6);
    expect(fallback).toBeCloseTo(4, 6);   // claude-opus-5-5 input $4/M
  });
});

describe("imageCostUsd / toolCostUsd", () => {
  it("returns the per-image rate", () => {
    expect(imageCostUsd("flux-schnell")).toBeCloseTo(0.003, 6);
    expect(imageCostUsd("ideogram-character")).toBeCloseTo(0.15, 6);
  });
  it("falls back to default image model for unknown id", () => {
    expect(imageCostUsd("nope")).toBeCloseTo(0.003, 6); // flux-schnell default
  });
  it("printful mockup is free", () => {
    expect(toolCostUsd("printful-mockup")).toBe(0);
  });
  it("unknown tool is free (no silent fabricated cost)", () => {
    expect(toolCostUsd("nope")).toBe(0);
  });
});

describe("featureUnitCostUsd", () => {
  it("article includes the perplexity extraUsd", () => {
    const article = TEXT_FEATURES.find((f) => f.key === "article")!;
    const base = textCallCostUsd({ model: article.model, inputTokens: article.inputTok, outputTokens: article.outputTok });
    expect(featureUnitCostUsd(article)).toBeCloseTo(base + (article.extraUsd ?? 0), 9);
  });
});

describe("usdToNtd", () => {
  it("multiplies by TWD_RATE", () => {
    expect(usdToNtd(1)).toBeCloseTo(TWD_RATE, 6);
  });
});

describe("estimateMonthly", () => {
  it("empty input → zero everywhere", () => {
    const r = estimateMonthly({});
    expect(r.totalUsd).toBe(0);
    expect(r.textLines).toHaveLength(0);
    expect(r.imageLines).toHaveLength(0);
  });

  it("articles expand into companion features (outline/title/keywords + article)", () => {
    const r = estimateMonthly({ articles: 10 });
    const keys = r.textLines.map((l) => l.key).sort();
    expect(keys).toEqual(["article", "keywords", "outline", "title"]);
    for (const l of r.textLines) expect(l.count).toBe(10);
    expect(r.textUsd).toBeGreaterThan(0);
  });

  it("images use the chosen model rate", () => {
    const r = estimateMonthly({ images: 100, imageModel: "ideogram-character" });
    expect(r.imageLines).toHaveLength(1);
    expect(r.imageUsd).toBeCloseTo(100 * 0.15, 6);
  });

  it("clients multiply per-client bundle (articles + images)", () => {
    const r = estimateMonthly({ clients: 3, articlesPerClient: 4, imagesPerClient: 8, imageModel: "flux-schnell" });
    const article = r.textLines.find((l) => l.key === "article")!;
    expect(article.count).toBe(12); // 3 * 4
    expect(r.imageLines[0].count).toBe(24); // 3 * 8
  });

  it("includeInfra folds the monthly baseline into the total", () => {
    const withInfra = estimateMonthly({ articles: 1, includeInfra: true });
    const without = estimateMonthly({ articles: 1, includeInfra: false });
    expect(withInfra.infraUsd).toBeGreaterThan(0);
    expect(withInfra.totalUsd).toBeCloseTo(without.totalUsd + withInfra.infraUsd, 6);
  });

  it("perFeatureCalls compose with coarse article knob", () => {
    const r = estimateMonthly({ articles: 2, perFeatureCalls: { humanize: 5 } });
    expect(r.textLines.find((l) => l.key === "humanize")!.count).toBe(5);
    expect(r.textLines.find((l) => l.key === "article")!.count).toBe(2);
  });

  it("toolRuns add to toolUsd", () => {
    const r = estimateMonthly({ toolRuns: { inpaint: 10 } });
    expect(r.toolUsd).toBeCloseTo(10 * 0.04, 6);
  });

  it("totalNtd = totalUsd * TWD_RATE", () => {
    const r = estimateMonthly({ images: 50, imageModel: "flux-dev" });
    expect(r.totalNtd).toBeCloseTo(usdToNtd(r.totalUsd), 6);
  });
});

describe("the Gemini Flash-Lite model in use is priced", () => {
  it("GEMINI_LITE_MODEL has its own price row, not the fallback (lib/ai/gemini-models.ts)", async () => {
    const { GEMINI_LITE_MODEL } = await import("../gemini-models");
    const { resolveTextRate } = await import("../cost-calculator");
    const r = resolveTextRate(GEMINI_LITE_MODEL);
    expect(r.fallback).toBe(false);
    expect(r.matchedKey).toBe(GEMINI_LITE_MODEL);
  });
});

describe("resolveTextRate -- dated ids echoed by the API", () => {
  it("an OpenAI dated id and a mini variant take their own row, not the bigger model's", async () => {
    const { resolveTextRate } = await import("../cost-calculator");
    expect(resolveTextRate("gpt-4o-mini-2024-07-18")).toMatchObject({ matchedKey: "gpt-4o-mini", fallback: false });
    expect(resolveTextRate("gpt-5.4-mini-2026-03-01")).toMatchObject({ matchedKey: "gpt-5.4-mini", fallback: false });
    expect(resolveTextRate("gpt-4o-mini-search-preview")).toMatchObject({ matchedKey: "gpt-4o-mini", fallback: false });
    expect(resolveTextRate("claude-haiku-4-5-20251001")).toMatchObject({ matchedKey: "claude-haiku-4-5-20251001" });
  });
});
