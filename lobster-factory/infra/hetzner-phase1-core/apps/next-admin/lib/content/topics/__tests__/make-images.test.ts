// An automatic article is written in the site language, and its image placeholders become stored images or disappear.
import { describe, expect, it, vi } from "vitest";
import { articleInput, fillArticleImages, optionalImageGrant, TOPIC_ARTICLE_IMAGES } from "../make";
import { EntitlementRequired } from "@/lib/entitlements/can";
import { siteLanguage } from "@/lib/content/brand-voice";

describe("automatic article language", () => {
  it("a site with no language set writes in the same language its topics are planned in (never the article tool's English default)", () => {
    expect(articleInput({ keyword: "k", title: "t", angle: null }, {}).language).toBe(siteLanguage({}));
    expect(siteLanguage({})).toBe("繁體中文");
  });
});

describe("automatic article images", () => {
  it("asks the article for the given image count, and for none without images", () => {
    expect(articleInput({ keyword: "k", title: "t", angle: null }, {}, TOPIC_ARTICLE_IMAGES).media).toMatchObject({ imageCount: TOPIC_ARTICLE_IMAGES });
    expect(articleInput({ keyword: "k", title: "t", angle: null }, {}).media).toEqual({ aiImages: "none" });
  });

  it("an organization without content.image gets its article without images; any other grant failure still stops it", async () => {
    expect(await optionalImageGrant(async () => { throw new EntitlementRequired("denied"); })).toBeNull();
    await expect(optionalImageGrant(async () => { throw new Error("entitlements_db_unavailable"); })).rejects.toThrow("entitlements_db_unavailable");
  });

  it("each placeholder becomes its image (alt text is the prompt); a failed one is removed, not left behind", async () => {
    const make = vi.fn(async (prompt: string) => (prompt === "壞掉" ? null : `https://cdn/x-${prompt}.webp`));
    const md = "# T\n\n![秋天散步](IMAGE_PLACEHOLDER_1)\n\n段落\n\n![壞掉](IMAGE_PLACEHOLDER_2)\n\n![呼吸](IMAGE_PLACEHOLDER_3)";
    const r = await fillArticleImages(md, make);
    expect(make.mock.calls.map((c) => c[0])).toEqual(["秋天散步", "壞掉", "呼吸"]);
    expect(r.images).toEqual(["https://cdn/x-秋天散步.webp", "https://cdn/x-呼吸.webp"]);
    expect(r.markdown).toContain("![秋天散步](https://cdn/x-秋天散步.webp)");
    expect(r.markdown).not.toMatch(/IMAGE_PLACEHOLDER|壞掉/);
  });

  it("a thrown image error counts as a failed image", async () => {
    const r = await fillArticleImages("![a](IMAGE_PLACEHOLDER_1)", async () => { throw new Error("replicate down"); });
    expect(r).toEqual({ markdown: "", images: [] });
  });
});
