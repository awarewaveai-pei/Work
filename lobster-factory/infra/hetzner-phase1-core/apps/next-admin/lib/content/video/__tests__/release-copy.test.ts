// Card VD.9: free default copy for a ticked channel; the AI rewrite's price is NT$ at the cost model's one rate.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { featureUnitCostUsd } from "@/lib/ai/cost-calculator";
import { TEXT_FEATURES, TWD_RATE } from "@/lib/ai/cost-model";
import { defaultCopy, syndicateCostTwd } from "../release-copy";

describe("defaultCopy", () => {
  it("title, a blank line, the script's first non-empty line", () => {
    expect(defaultCopy("春季新品", "\n  第一行  \n第二行")).toBe("春季新品\n\n第一行");
  });
  it("either part missing, or the first line repeating the title, leaves just what there is", () => {
    expect(defaultCopy("", "第一行")).toBe("第一行");
    expect(defaultCopy("標題", "")).toBe("標題");
    expect(defaultCopy("標題", "標題\n內文")).toBe("標題");
    expect(defaultCopy(undefined, undefined)).toBe("");
  });
});

describe("syndicateCostTwd", () => {
  it("is the cost model's syndicate run at TWD_RATE, rounded up to 0.1", () => {
    const usd = featureUnitCostUsd(TEXT_FEATURES.find((f) => f.key === "syndicate")!);
    expect(syndicateCostTwd()).toBe(Math.ceil(usd * TWD_RATE * 10) / 10);
    expect(syndicateCostTwd()).toBeGreaterThan(0);
  });
  it("the release page shows no US$ price and names the AI button in NT$", () => {
    const page = readFileSync(path.join(__dirname, "../../../../app/(shell)/tools/video/ReleaseDeliveryPanel.tsx"), "utf8");
    expect(page).not.toMatch(/US\$/);
    expect(page).toContain("NT${syndicateCostTwd()}");
  });
});
