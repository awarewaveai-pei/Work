import { describe, expect, it } from "vitest";
import { forbiddenTerms, renderBrandVoice, renderMarketingBrief } from "../brand-voice";
import { loadSiteBrand } from "../brand-voice-store";

describe("renderMarketingBrief", () => {
  it("renders the filled rows in the article tool's order, with labels for stage and price", () => {
    expect(renderMarketingBrief({ audience: " 上班族 ", funnelStage: "decision", pricePositioning: "premium", forbiddenClaims: "保證治癒" })).toBe([
      "=== 行銷簡報 (Marketing Brief) — 依此精準打中目標、提高轉換 ===",
      "目標受眾: 上班族",
      "漏斗階段: 決策（準備行動／購買）（請對齊此階段的讀者心態與行動呼籲）",
      "價格定位: 高端精品（強調價值與稀缺）",
      "避免使用/禁用聲明: 保證治癒",
      "=== END 行銷簡報 ===",
    ].join("\n"));
  });

  it("is empty when nothing is filled in", () => {
    expect(renderMarketingBrief(undefined)).toBe("");
    expect(renderMarketingBrief({ audience: "  ", funnelStage: "" })).toBe("");
  });
});

describe("renderBrandVoice", () => {
  it("puts the brief first and the instructions after one blank line", () => {
    expect(renderBrandVoice({ usp: "手作" }, " 語氣溫暖 ")).toMatch(/^=== 行銷簡報[\s\S]*獨特賣點\/差異化: 手作\n=== END 行銷簡報 ===\n\n語氣溫暖$/);
  });

  it("returns whichever part exists alone", () => {
    expect(renderBrandVoice(undefined, "只有指示")).toBe("只有指示");
    expect(renderBrandVoice({ usp: "手作" }, "")).toMatch(/END 行銷簡報 ===$/);
    expect(renderBrandVoice(undefined, undefined)).toBe("");
  });
});

describe("forbiddenTerms", () => {
  it("splits on every separator people type", () => {
    expect(forbiddenTerms({ marketing: { forbiddenClaims: "保證治癒，100%有效、醫療級; 立即見效\n無副作用" } }))
      .toEqual(["保證治癒", "100%有效", "醫療級", "立即見效", "無副作用"]);
    expect(forbiddenTerms(undefined)).toEqual([]);
  });
});

function fakeSb(result: { data: unknown; error: { message: string } | null }) {
  const calls: Array<[string, unknown]> = [];
  const q = {
    select: () => q,
    eq: (col: string, v: unknown) => { calls.push([col, v]); return q; },
    maybeSingle: async () => result,
  };
  return { sb: { from: () => q } as never, calls };
}

describe("loadSiteBrand", () => {
  it("returns the active site's defaults and owning organization", async () => {
    const { sb, calls } = fakeSb({ data: { id: "s1", name: "Soulful", organization_id: "o1", content_defaults: { tone: "warm" } }, error: null });
    expect(await loadSiteBrand(sb, "s1")).toEqual({ siteId: "s1", organizationId: "o1", name: "Soulful", defaults: { tone: "warm" } });
    expect(calls).toEqual([["id", "s1"], ["active", true]]);
  });

  it("returns null for a missing site and empty defaults for a site that never saved any", async () => {
    expect(await loadSiteBrand(fakeSb({ data: null, error: null }).sb, "x")).toBeNull();
    const r = await loadSiteBrand(fakeSb({ data: { id: "s", name: "n", organization_id: null, content_defaults: null }, error: null }).sb, "s");
    expect(r?.defaults).toEqual({});
  });

  it("throws on a database error instead of reading as no brand", async () => {
    await expect(loadSiteBrand(fakeSb({ data: null, error: { message: "down" } }).sb, "s")).rejects.toThrow("brand_voice:load:down");
  });
});
