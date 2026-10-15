// C10: the free path reads the article's own excerpt / image / link; the AI path maps our channels to syndicate's keys
// and back, and the button's price is the cost model's syndicate feature.
import { describe, expect, it } from "vitest";
import { featureUnitCostUsd } from "@/lib/ai/cost-calculator";
import { TEXT_FEATURES, TWD_RATE } from "@/lib/ai/cost-model";
import { articleFromWp, rewriteCostTwd, syndicatePlatforms, textsFromSyndicate } from "../wp-article";

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

  it("AI path: our platforms to syndicate's keys, its answer back to each channel; the price comes from the cost model", () => {
    expect(syndicatePlatforms(["bluesky", "x", "facebook", "linkedin-page", "mastodon"])).toEqual(["twitter", "facebook", "linkedin"]);
    const texts = textsFromSyndicate({ twitter_single: "short one", facebook: "  longer one  ", linkedin: "" },
      [{ id: "b", platform: "bluesky" }, { id: "f", platform: "facebook" }, { id: "l", platform: "linkedin" }]);
    expect(texts).toEqual({ b: "short one", f: "longer one" });   // empty answer: the channel keeps the shared text
    const f = TEXT_FEATURES.find((x) => x.key === "syndicate")!;
    expect(rewriteCostTwd()).toBe(Math.ceil(featureUnitCostUsd(f) * TWD_RATE * 10) / 10);
    expect(rewriteCostTwd()).toBeGreaterThan(0);
  });
});
