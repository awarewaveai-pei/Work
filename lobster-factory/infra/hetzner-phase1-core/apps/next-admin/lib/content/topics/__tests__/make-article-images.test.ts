// K10: an automatic article's images -- every body placeholder drawn from its scene on the site's model and style at 4:3,
// then a cover of its own from the meta block's scene at 16:9 (the cover layout's picture area); the cover (not the first body image) is the draft's featured
// image, and its scene, short title and subtitle are kept on the topic. K25: the featured image is the cover layout
// (renderCover, mocked) on that picture with the short title, subtitle and the site's cover settings.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  defaults: {} as Record<string, unknown>,
  calls: [] as Array<{ model: string; prompt: string; aspectRatio: string; imageStyle?: string; purpose?: string }>,
  published: [] as Array<Record<string, unknown>>,
  article: "",
  covers: [] as Array<{ bg: string; text: { title: string; subtitle?: string }; settings: unknown }>,
  coverFails: false,
  stored: 0,
}));
vi.mock("@/lib/entitlements/grant", () => ({ runForOrg: (_o: string, _a: string, fn: () => unknown) => fn(), grantFor: async () => ({ actor: "staff:x" }) }));
vi.mock("@/lib/content/brand-voice-store", () => ({ loadSiteBrand: async () => ({ organizationId: "org1", defaults: m.defaults }) }));
vi.mock("@/lib/storage/r2", () => ({
  isR2Configured: () => true,
  isDesignsAsset: (u: unknown) => typeof u === "string" && u.startsWith("https://cdn/"),
  getDesignObjectByUrl: async (u: string) => ({ ok: true, body: Buffer.from(u), contentType: "image/webp" }),
  parseImageDataUrl: () => null,
  buildDesignKey: () => "designs/2026-11/cover.webp",
  putDesignObject: async () => ({ ok: true, publicUrl: `https://cdn/cover-${++m.stored}.webp` }),
}));
vi.mock("@/lib/content/cover/render", () => ({
  renderCover: async (bg: Buffer, text: { title: string; subtitle?: string }, settings: unknown) => {
    m.covers.push({ bg: bg.toString(), text, settings });
    if (m.coverFails) throw new Error("render broke");
    return { buffer: Buffer.from("cover"), mime: "image/webp" };
  },
}));
vi.mock("@/lib/content/image/make-image", () => ({
  makeContentImage: async (i: (typeof m.calls)[number]) => { m.calls.push(i); return { ok: true, stored: true, imageUrl: `https://cdn/${m.calls.length}.webp`, seed: null }; },
}));
vi.mock("@/lib/content/pipeline", () => ({
  runContentPipeline: async (input: Record<string, unknown>, opts: { stages: string[] }) => {
    if (opts.stages[0] === "article") return { ok: true, markdown: m.article };
    m.published.push(input);
    return { ok: true, publish: { post_id: 1, edit_url: "e" }, qualityReport: { score: 80 } };
  },
}));

import { topicDeps, TOPIC_ARTICLE_IMAGES } from "../make";
import { stepUpperTwd } from "../budget";
import { articleStylePrompt } from "@/lib/content/image/article-image";
import { STYLE_CATALOG } from "@/public/editor-shared/art-styles.js";
import type { Topic } from "../store";

const sb = { from: () => ({ select: () => { const q = { eq: () => q, gte: () => q, order: () => q, range: async () => ({ data: [], error: null }) }; return q; } }) };
const topic: Topic = {
  id: "11111111-1111-4111-8111-111111111111", organization_id: "org1", site_id: "s1", title: "正念", keyword: "正念", angle: null,
  source: "manual", source_ref: {}, month: "2026-11-01", scheduled_for: null, formats: ["article"], status: "generating",
  artifacts: {}, review: null, version: 1, last_error: null, started_on: null, created_by: "x", created_at: "", updated_at: "",
};
const ARTICLE = [
  "<!-- CONTENT_META_START -->", "SEO_TITLE: 正念呼吸 7 個方法", "META_DESC: 描述", "FOCUS_KEYWORD: 正念",
  "COVER_SCENE: A quiet lake at sunrise with a woman sitting cross-legged on the shore", "COVER_TITLE: 正念呼吸入門", "COVER_SUBTITLE: 五分鐘找回平靜",
  "<!-- CONTENT_META_END -->", "# 正念呼吸",
  ...[1, 2, 3, 4].map((n) => `![第${n}段](IMAGE_PLACEHOLDER_${n} "Scene ${n}: hands resting on knees in soft light")`),
].join("\n\n");
const WATERCOLOR = STYLE_CATALOG.find((s) => s.group === "媒材")!;
const make = () => topicDeps(sb as never, "org1", "staff:x", { capTwd: 100 }).make(topic);
type Article = { cover?: Record<string, unknown> };

beforeEach(() => { Object.assign(m, { defaults: {}, calls: [], published: [], article: ARTICLE, covers: [], coverFails: false, stored: 0 }); vi.stubEnv("SERPER_API_KEY", ""); });

describe("automatic article images (K10)", () => {
  it("4 body images from their scenes plus 1 cover from its own scene; the cover is the featured image, not body image 1", async () => {
    const made = await make();
    expect(TOPIC_ARTICLE_IMAGES).toBe(4);
    expect(m.calls.map((c) => c.prompt)).toEqual([1, 2, 3, 4].map((n) => `Scene ${n}: hands resting on knees in soft light`)
      .concat("A quiet lake at sunrise with a woman sitting cross-legged on the shore"));
    expect(m.calls.map((c) => c.aspectRatio)).toEqual(["4:3", "4:3", "4:3", "4:3", "16:9"]);
    expect(m.calls.every((c) => c.purpose === "article")).toBe(true);
    expect(m.published[0].featuredImageUrl).toBe("https://cdn/cover-1.webp");
    expect(String(m.published[0].markdown)).toContain("![第1段](https://cdn/1.webp)");
    expect((made.artifacts.article as Article).cover).toEqual({ scene: "A quiet lake at sunrise with a woman sitting cross-legged on the shore",
      title: "正念呼吸入門", subtitle: "五分鐘找回平靜", image_url: "https://cdn/cover-1.webp", base_url: "https://cdn/5.webp" });
  });

  it("the site's style and model are used; no style = the photo look; an unusable model = the default", async () => {
    m.defaults = { imageStyle: WATERCOLOR.zh, imageModel: "nano-banana-2" };
    await make();
    expect(m.calls.every((c) => c.imageStyle === WATERCOLOR.prompt && c.model === "nano-banana-2")).toBe(true);
    m.calls = [];
    m.defaults = { imageModel: "flux-2-max" };   // K26: an old value dropped from the list = not set
    await make();
    expect(m.calls.every((c) => c.imageStyle === articleStylePrompt(undefined) && c.model === "flux-schnell")).toBe(true);
  });

  it("K26 the schedule's source: its own setting first, then the site's when a schedule can use it, then the default", async () => {
    m.defaults = { imageModel: "nano-banana-2", scheduleImageModel: "openai-low" };
    await make();
    expect(m.calls.length).toBe(TOPIC_ARTICLE_IMAGES + 1);
    expect(m.calls.every((c) => c.model === "openai-low")).toBe(true);
    m.calls = [];
    m.defaults = { imageModel: "codex-image" };   // the manual default only the operator's laptop can draw: not for the schedule
    await make();
    expect(m.calls.length).toBe(TOPIC_ARTICLE_IMAGES + 1);
    expect(m.calls.every((c) => c.model === "flux-schnell")).toBe(true);
    m.calls = [];
    m.defaults = { imageModel: "codex-image", scheduleImageModel: "none" };
    await make();
    expect(m.calls).toEqual([]);
  });

  it("a site set to None（不生成）: no image is drawn or reserved, and the article asks for none", async () => {
    m.defaults = { imageModel: "none" };
    const made = await make();
    expect(m.calls).toEqual([]);
    expect((made.artifacts as { budget: { spentTwd: number } }).budget.spentTwd).toBe(stepUpperTwd.article(0, { imageModel: "none" }));
    expect((made.artifacts.article as Article).cover).toBeUndefined();
  });

  it("the reservation counts body + cover on the site's model", async () => {
    const road = { textChain: undefined, textApiModel: undefined, imageModel: "nano-banana-2" };
    expect(stepUpperTwd.article(5, road)).toBeGreaterThan(stepUpperTwd.article(5, { ...road, imageModel: "flux-schnell" }));
    m.defaults = { imageModel: "nano-banana-2" };
    const made = await make();
    expect((made.artifacts as { budget: { spentTwd: number } }).budget.spentTwd).toBe(stepUpperTwd.article(TOPIC_ARTICLE_IMAGES + 1, road));
  });

  it("K26 the reservation is priced on the model actually drawn with (the schedule's own source)", async () => {
    m.defaults = { imageModel: "flux-schnell", scheduleImageModel: "nano-banana-2" };
    const made = await make();
    expect(new Set(m.calls.map((c) => c.model))).toEqual(new Set(["nano-banana-2"]));
    expect((made.artifacts as { budget: { spentTwd: number } }).budget.spentTwd)
      .toBe(stepUpperTwd.article(TOPIC_ARTICLE_IMAGES + 1, { imageModel: "nano-banana-2" }));
  });

  it("an article without a scene or cover fields (old model behaviour): alt text draws the body, the SEO title the cover", async () => {
    m.article = "<!-- CONTENT_META_START -->\n\nSEO_TITLE: 標題\n\nMETA_DESC: 描述\n\n<!-- CONTENT_META_END -->\n\n![呼吸](IMAGE_PLACEHOLDER_1)";
    const made = await make();
    expect(m.calls.map((c) => c.prompt)).toEqual(["呼吸", "標題"]);
    expect((made.artifacts.article as Article).cover).toEqual({ image_url: "https://cdn/cover-1.webp", base_url: "https://cdn/2.webp" });
  });
});

describe("the featured image is the cover layout (K25)", () => {
  type Checks = { checks: Array<{ name: string; pass: boolean; detail: string }> };

  it("renderCover gets the cover picture, the short title, the subtitle and the site's cover settings", async () => {
    m.defaults = { cover: { bandColor: "#123456", titleColor: "#ffffff", subtitleColor: "#abcdef", font: "serif" } };
    await make();
    expect(m.covers).toEqual([{ bg: "https://cdn/5.webp", text: { title: "正念呼吸入門", subtitle: "五分鐘找回平靜" },
      settings: { bandColor: "#123456", titleColor: "#ffffff", subtitleColor: "#abcdef", font: "serif" } }]);
    expect(m.published[0].featuredImageUrl).toBe("https://cdn/cover-1.webp");
  });

  it("no short title: the article's title goes on the cover", async () => {
    m.article = ARTICLE.replace("COVER_TITLE: 正念呼吸入門", "");
    await make();
    expect(m.covers[0].text.title).toBe("正念呼吸 7 個方法");
  });

  it("renderCover fails: the article is still saved, its featured image is the plain picture, and the checks say 封面未套版", async () => {
    m.coverFails = true;
    const made = await make();
    expect(m.published).toHaveLength(1);
    expect(m.published[0].featuredImageUrl).toBe("https://cdn/5.webp");
    const note = (made.artifacts.article as Checks).checks.find((c) => c.name === "cover");
    expect(note?.detail).toContain("封面未套版");
    expect(note?.pass).toBe(true);
  });
});
