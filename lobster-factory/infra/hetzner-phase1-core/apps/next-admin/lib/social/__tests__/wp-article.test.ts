// C10: the free path reads the article's own excerpt / image / link; the AI path's price is the cost model's syndicate
// feature (its channel mapping lives in lib/social/write-posts.ts).
import { describe, expect, it } from "vitest";
import { featureUnitCostUsd } from "@/lib/ai/cost-calculator";
import { TEXT_FEATURES, TWD_RATE } from "@/lib/ai/cost-model";
import { articleFromWp, rewriteCostTwd } from "../wp-article";
import { MAX_WRITER_CALLS } from "../write-posts";

describe("WordPress article -> post", () => {
  it("excerpt path: plain text from the REST answer, https featured image only", () => {
    const a = articleFromWp({
      title: { rendered: "藝術治療&amp;畫畫課" }, excerpt: { rendered: "<p>很多家長問我們 [&hellip;]</p>\n" },
      content: { rendered: "<p>第一段</p><p>第二段</p>" }, link: "https://soulful.example/blog/a",
      _embedded: { "wp:featuredmedia": [{ source_url: "https://soulful.example/img.jpg" }] },
    });
    expect(a).toEqual({ title: "藝術治療&畫畫課", excerpt: "很多家長問我們…", content: "第一段\n第二段", link: "https://soulful.example/blog/a", image: "https://soulful.example/img.jpg" });
    expect(articleFromWp({ _embedded: { "wp:featuredmedia": [{ source_url: "http://insecure/img.jpg" }] } }).image).toBeNull();
  });

  it("AI path: the button's price comes from the cost model (platform mapping: write-posts.test.ts)", () => {
    const f = TEXT_FEATURES.find((x) => x.key === "syndicate")!;
    const { usual, max } = rewriteCostTwd();
    expect(usual).toBe(Math.ceil(featureUnitCostUsd(f) * TWD_RATE * 10) / 10);
    expect(usual).toBeGreaterThan(0);
    // the button's upper bound covers the one shorter rewrite write-posts.ts may make
    expect(max).toBe(Math.ceil(featureUnitCostUsd(f) * MAX_WRITER_CALLS * TWD_RATE * 10) / 10);
  });
});
