// K10: an article image is drawn from its scene (else its alt text) + the style + the no-text tail; the scene never
// reaches WordPress; only a model that draws at once is used; a short article gets 3 body images, any other 4.
import { describe, expect, it, vi } from "vitest";

const gen = vi.hoisted(() => ({ prompts: [] as string[] }));
vi.mock("@/lib/tarot/image-gen", async (orig) => ({
  ...(await orig<typeof import("@/lib/tarot/image-gen")>()),
  generateTarotImage: async (p: { prompt: string }) => { gen.prompts.push(p.prompt); return { ok: true, image: "data:image/png;base64,AAAA", seed: 1 }; },
}));
vi.mock("@/lib/storage/r2", () => ({ isR2Configured: () => false, buildDesignKey: () => null, putDesignObject: async () => ({ ok: false }) }));

import { ARTICLE_DEFAULT_STYLE, ARTICLE_IMAGE_MODELS, ARTICLE_IMAGE_SOURCES, ARTICLE_IMAGE_TAIL, articleBodyImages, articleImageChoice, articleImageModel, articleStylePrompt, fillPlaceholder, imagePlaceholders, placeholderScene, scheduleImageModel } from "../article-image";
import { makeContentImage } from "../make-image";
import { isTarotModel, TAROT_MODELS } from "@/lib/tarot/image-gen";
import { markdownToHtml } from "@/lib/content/publish/wordpress-core";
import { STYLE_CATALOG } from "@/public/editor-shared/art-styles.js";

const grant = { actor: "staff:x" } as never;
const WATERCOLOR = STYLE_CATALOG.find((s) => s.group === "媒材")!;

describe("article image prompt", () => {
  it("with a scene: scene + the chosen style + the tail; without one: the alt text + the photo default + the tail", async () => {
    gen.prompts = [];
    const md = '![正念呼吸](IMAGE_PLACEHOLDER_1 "A woman breathing slowly by a window at dawn")\n\n![舊草稿](IMAGE_PLACEHOLDER_2)';
    for (const m of md.matchAll(imagePlaceholders())) {
      await makeContentImage({ model: "flux-schnell", prompt: (m[3] ?? "").trim() || m[1], aspectRatio: "4:3", seed: null,
        imageStyle: m[2] === "1" ? WATERCOLOR.prompt : "", purpose: "article", costLog: { route: "t", tool: "t" } }, grant);
    }
    const style = (p: string) => p.trim().replace(/[.\s]+$/, "");
    expect(gen.prompts).toEqual([
      `A woman breathing slowly by a window at dawn. ${style(WATERCOLOR.prompt)}. ${ARTICLE_IMAGE_TAIL}`,
      `舊草稿. ${style(articleStylePrompt(undefined))}. ${ARTICLE_IMAGE_TAIL}`,
    ]);
    expect(articleStylePrompt(undefined)).toBe(STYLE_CATALOG.find((s) => s.zh === ARTICLE_DEFAULT_STYLE)!.prompt);
  });

  it("the alt text goes to WordPress as it was; the scene (a Markdown title) never does", () => {
    const md = '# T\n\n![正念呼吸練習](IMAGE_PLACEHOLDER_1 "A woman breathing slowly by a window")\n\n段落';
    const filled = fillPlaceholder(md, "1", "https://cdn.example.com/a.webp");
    expect(filled).toContain("![正念呼吸練習](https://cdn.example.com/a.webp)");
    const html = markdownToHtml(filled);
    expect(html).toContain('src="https://cdn.example.com/a.webp"');
    expect(html).toContain('alt="正念呼吸練習"');
    expect(html).not.toMatch(/breathing|IMAGE_PLACEHOLDER/);
  });

  it("a scene in other quotes is read the same; an unresolved cue in any shape never shows its text", () => {
    const md = "![a](IMAGE_PLACEHOLDER_1 'single quoted scene')\n\n![b](IMAGE_PLACEHOLDER_2 “curly scene”)";
    expect([...md.matchAll(imagePlaceholders())].map(placeholderScene)).toEqual(["single quoted scene", "curly scene"]);
    expect(fillPlaceholder(md, 2, "https://x/b.webp")).toContain("![b](https://x/b.webp)");
    const odd = '段落一\n\n![c](IMAGE_PLACEHOLDER_3 "a "quoted" word (and parens)")\n\n段落二';
    expect(markdownToHtml(odd)).not.toMatch(/quoted|parens|IMAGE_PLACEHOLDER/);
  });
});

describe("article image model and count", () => {
  it("a listed source is kept; a stock row, a dropped or unknown model, or none fall back to the default", () => {
    expect(articleImageModel("nano-banana-2")).toBe("nano-banana-2");
    expect(articleImageModel("codex-image")).toBe("codex-image");
    for (const bad of ["flux-2-max", "pexels-all", "ideogram-character", "nope", undefined]) expect(articleImageModel(bad)).toBe("flux-schnell");
  });

  it("K26 a stored value outside the list reads as not set; listed sources and none read as themselves", () => {
    for (const old of ["flux-2-max", "ideogram-v3-balanced", "nano-banana-pro", "x", undefined, 3]) expect(articleImageChoice(old)).toBe("");
    for (const ok of [...ARTICLE_IMAGE_MODELS, "none"]) expect(articleImageChoice(ok)).toBe(ok);
    expect(scheduleImageModel({ imageModel: "ideogram-v3-balanced" })).toBe("flux-schnell");
    expect(scheduleImageModel({ scheduleImageModel: "codex-image", imageModel: "flux-dev" })).toBe("flux-dev");
  });

  it("no catalog style is cut by the size guard", () => {
    expect(Math.max(...STYLE_CATALOG.map((s) => s.prompt.length))).toBeLessThanOrEqual(1000);
  });

  it("K26 the six K13 sources; every one a generator model, and only the laptop's Codex kept off the schedule", () => {
    expect([...ARTICLE_IMAGE_MODELS].sort()).toEqual(["codex-image", "flux-2-klein-4b", "flux-dev", "flux-schnell", "nano-banana-2", "openai-low"]);
    for (const id of ARTICLE_IMAGE_MODELS) expect(isTarotModel(id)).toBe(true);
    expect(ARTICLE_IMAGE_SOURCES.filter((s) => !s.schedule).map((s) => s.value))
      .toEqual(ARTICLE_IMAGE_MODELS.filter((id) => TAROT_MODELS[id as keyof typeof TAROT_MODELS].provider === "codex"));
  });

  it("a short article gets 3 body images, any other size 4", () => {
    expect(articleBodyImages("short")).toBe(3);
    expect([articleBodyImages("medium"), articleBodyImages("long"), articleBodyImages()]).toEqual([4, 4, 4]);
  });
});
