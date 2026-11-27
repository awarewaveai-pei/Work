import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCatalogIndex, chineseBlurb, encodeCatalogIndex } from "../catalog-index";

describe("public catalog index (U26)", () => {
  it("catalog.json equals a fresh export of the registry", () => {
    const file = readFileSync(path.join(__dirname, "..", "catalog.json"), "utf8");
    expect(file === encodeCatalogIndex(buildCatalogIndex()), "catalog.json is stale: run node scripts/export-catalog.mjs").toBe(true);
  });

  it("carries no price, billing or other internal field", () => {
    const keys = new Set<string>();
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x); }
    };
    walk(buildCatalogIndex());
    for (const banned of ["price", "prices", "billing", "limitKind", "buyout", "plans", "loginSources", "staffPaths", "status", "modules", "accessChannels"]) {
      expect(keys.has(banned), banned).toBe(false);
    }
  });

  it("a cognitive method's blurb is the Chinese part of its name, else the product's", () => {
    expect(chineseBlurb("ai.draft_record -- Plain-language brief to method input draft (AI Gateway)", "產品一句話")).toBe("產品一句話");
    expect(chineseBlurb("strategy.swot -- SWOT 分析", "產品一句話")).toBe("SWOT 分析");
    expect(chineseBlurb("ICE 評分法", "產品一句話")).toBe("ICE 評分法");
  });
});
