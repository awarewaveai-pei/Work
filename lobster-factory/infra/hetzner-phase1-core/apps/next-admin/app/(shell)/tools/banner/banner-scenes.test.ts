// Card R3-C (named tests): a size's background -- own picture or the main size's -- and the scene / composite prompts
// carrying the text area and the product area in the generated picture's coordinates.
import { describe, expect, it } from "vitest";
import { forgePrompt } from "@/lib/script-forge/modules";
import { boxOnPicture, compositePrompt, scenePrompt } from "./banner-design";
import { productDrawn } from "./banner-layout";
import {
  INIT, designSig, enterSize, groundingOn, leaveSize, narrowedSizes, pictureAspect, sceneBackground, variantOf, withSharedBackground, withSizeBackgrounds, type State,
} from "./banner-state";

const A = "data:image/png;base64,AAAA", B = "data:image/png;base64,BBBBBB", C = "data:image/png;base64,CCCCCCCC";
const pic = (image: string) => ({ image, area: null });
const ALL = ["r4x5", "r9x16", "r16x9"] as const;
const base: State = { ...INIT, preset: "r4x5", multiSizes: ["r9x16", "r16x9"], bgMode: "ai", bgImage: A };

describe("SIZE_KEYS 背景：沿用與覆寫", () => {
  it("a size without its own picture uses the main size's; one with its own keeps it", () => {
    const st = withSizeBackgrounds(base, { r9x16: pic(B) }, ALL);
    expect(variantOf(st, "r9x16")).toMatchObject({ bgImage: B, bgImageHasProduct: true });
    expect(variantOf(st, "r16x9")).toMatchObject({ bgImage: A, bgImageHasProduct: false });
    expect(st).toMatchObject({ bgImage: A, bgMode: "ai" });
  });

  it("composite per size: the main size's picture is the main design's, each other size holds its own", () => {
    const st = withSizeBackgrounds(base, { r4x5: pic(C), r9x16: pic(B), r16x9: pic(A) }, ALL);
    expect(st).toMatchObject({ bgImage: C, bgImageHasProduct: true });
    expect(st.sizeOverrides.r4x5).toBeUndefined();
    expect(variantOf(st, "r9x16").bgImage).toBe(B);
    expect(variantOf(st, "r16x9").bgImage).toBe(A);
  });

  it("a shared background (upload / scene picked) replaces every size's own picture and placement", () => {
    const own = withSizeBackgrounds(base, { r9x16: pic(B) }, ALL);
    const moved: State = { ...own, sizeOverrides: { ...own.sizeOverrides, r9x16: { ...own.sizeOverrides.r9x16, bgImgX: 0.2, headlineSize: 90 } } };
    const st = withSharedBackground(moved, { bgImage: C, bgMode: "ai", bgImageHasProduct: false });
    for (const k of ["r4x5", "r9x16", "r16x9"] as const) expect(variantOf(st, k)).toMatchObject({ bgImage: C, bgImageHasProduct: false, bgImgX: 0 });
    expect(st.sizeOverrides.r9x16).toEqual({ headlineSize: 90 }); // other tweaks stay
  });

  it("while a size is tweaked, a new picture lands in its override and the size stays open", () => {
    const editing = enterSize(base, "r9x16");
    const st = withSizeBackgrounds(editing, { r9x16: pic(B) }, ALL);
    expect(st.editingSize?.key).toBe("r9x16");
    expect(st.bgImage).toBe(B);                           // the live state is that size
    expect(leaveSize(st).sizeOverrides.r9x16?.bgImage).toBe(B);
    expect(leaveSize(st).bgImage).toBe(A);
  });

  it("history signature counts a size's picture by length, never its data", () => {
    const sig = designSig(withSizeBackgrounds(base, { r9x16: pic(B) }, ALL));
    expect(sig).not.toContain("BBBBBB");
    expect(sig).not.toContain(B);
  });
});

// Codex on R3-E (F2): a size whose composite failed this run drops the picture and area an older run left it, and
// crops this run's main picture (with its area) -- never shows a stale scene with a stale product area.
describe("R3-E Codex F2: a size that failed this run inherits this run's main picture", () => {
  it("an older run's own picture of r9x16 goes when r9x16 fails now; a size not in this run keeps its own", () => {
    const area1 = { x0: 0.1, y0: 0.5, x1: 0.5, y1: 0.9 }, area2 = { x0: 0.5, y0: 0.4, x1: 0.9, y1: 0.9 };
    const old = withSizeBackgrounds(base, { r9x16: { image: B, area: area1 }, r16x9: { image: B, area: area1 } }, ALL);
    const now = withSizeBackgrounds(old, { r4x5: { image: C, area: area2 } }, ["r4x5", "r9x16"]); // r9x16 failed; r16x9 not run
    expect(variantOf(now, "r9x16")).toMatchObject({ bgImage: C, bgImageHasProduct: true, bgProductArea: area2 });
    expect(variantOf(now, "r16x9")).toMatchObject({ bgImage: B, bgProductArea: area1 });
  });
});

describe("(F1) 選候選圖：只有含目前這張商品圖才算商品已烤進", () => {
  it("baked only when drawn with the current product picture; else a plain scene with the product drawn over it", () => {
    const area = { x0: 0.6, y0: 0.3, x1: 0.9, y1: 0.8 };
    expect(sceneBackground(A, "P1", "P1", area)).toEqual({ bgImage: A, bgMode: "ai", bgImageHasProduct: true, bgProductArea: area });
    expect(sceneBackground(A, "P1", "P2", area)).toMatchObject({ bgImageHasProduct: false, bgProductArea: null }); // product replaced since
    expect(sceneBackground(A, "P1", null, area).bgImageHasProduct).toBe(false);   // product removed since
    expect(sceneBackground(A, null, "P2", null).bgImageHasProduct).toBe(false);   // drawn as a plain scene, product added since
  });
});

describe("(F4) 商品由程式疊加時開擬真三項", () => {
  it("an uploaded background with a product picture: the product is drawn over it, so grounding turns on", () => {
    const st: State = { ...INIT, bgMode: "upload", bgImage: A, productImage: "P1" };
    expect(productDrawn(st)).toBe(true);
    const g = groundingOn(st.grounding);
    expect([g.shadow?.enabled, g.reflection?.enabled, g.tone?.enabled]).toEqual([true, true, true]);
    expect(productDrawn({ ...st, bgMode: "ai", bgImageHasProduct: true })).toBe(false); // baked: nothing drawn over
  });
});

describe("品牌色只限品牌角色", () => {
  it("the design prompt limits accent / CTA / badge to the kit; text and background colours stay free", () => {
    const bg = { mode: "color", colors: ["#112233"], meanLum: 0.2, zones: {} };
    const p = forgePrompt("banner", "design", { brief: "x", bg, palette: ["#aa0000", "#00aa00"], brandKit: true },
      { lang: "繁體中文", sceneCount: 6, customScenes: 3, brand: null })!.prompt;
    expect(p).toContain("accentColor / ctaBg / badgeColor 只能用色盤裡的顏色");
    expect(p).toContain("textColor / ctaTextColor / bgColor / gradFrom / gradTo 不限品牌色");
  });
});

describe("場景與合成 prompt", () => {
  it("a 3:1 banner is drawn at 16:9: its areas sit in the picture's visible middle band", () => {
    const a = boxOnPicture({ x: 0, y: 0, w: 1920, h: 640 }, { w: 1920, h: 640 }, "16:9");
    expect(a).toEqual({ x0: 0, y0: 0.2, x1: 1, y1: 0.8 });
    expect(boxOnPicture({ x: 540, y: 960, w: 540, h: 960 }, { w: 1080, h: 1920 }, "9:16")).toEqual({ x0: 0.5, y0: 0.5, x1: 1, y1: 1 });
  });

  it("the AI 一鍵設計 scene keeps the text area calm, leaves the product area open and draws no product or text", () => {
    const p = scenePrompt({ subject: "wooden table by a window", vibe: "warm morning light",
      textArea: { x0: 0.1, y0: 0.05, x1: 0.9, y1: 0.35 }, productArea: { x0: 0.3, y0: 0.5, x1: 0.7, y1: 0.95 } });
    expect(p).toContain("wooden table by a window, warm morning light");
    expect(p).toMatch(/No product.*no text/);
    expect(p).toContain("Keep the upper centre (x 10%-90%, y 5%-35% of the picture) calm and uncluttered");
    expect(p).toContain("Leave the lower centre (x 30%-70%, y 50%-95% of the picture) as an open, empty surface");
  });

  it("phone group: the whole product in that size's product area on the lower-right thirds crossing, text area clear", () => {
    const p = compositePrompt({ scene: "spa counter", group: "phone",
      productArea: { x0: 0.5, y0: 0.5, x1: 0.85, y1: 0.9 }, textArea: { x0: 0.05, y0: 0.05, x1: 0.95, y1: 0.4 } });
    expect(p).toContain("Place the product inside the lower right (x 50%-85%, y 50%-90% of the picture) -- the lower-right crossing of the rule-of-thirds lines");
    expect(p).toContain("WHOLE product inside that area and inside the picture");
    expect(p).toContain("about 40% of the picture height");
    expect(p).toContain("Keep the upper centre (x 5%-95%, y 5%-40% of the picture) clean");
  });

  it("R4-B card / web group: zoned by x only -- product column for the shown height, ~half that tall, text column clear top to bottom", () => {
    const productArea = { x0: 0.6, y0: 0.3, x1: 0.9, y1: 0.8 }, textArea = { x0: 0.05, y0: 0.2, x1: 0.55, y1: 0.8 };
    const p = compositePrompt({ scene: "spa counter", group: "card", productArea, textArea });
    expect(p).toContain("Place the product in the column x 60%-90% of the picture");
    expect(p).toContain("between y 0% and 100%");
    expect(p).toContain("about 50% of the picture height tall -- about half of the shown height");
    expect(p).toContain("Keep the whole column x 5%-55%, top to bottom, clean");
    expect(p).not.toMatch(/y 30%-80%|y 20%-80%/); // the AI ignores y (T1): no y range for either area
    // 3:1 drawn at 21:9: the shown band is y 11%-89% of the picture, so half of it is 39% of the picture
    const visible = boxOnPicture({ x: 0, y: 0, w: 1920, h: 640 }, { w: 1920, h: 640 }, "21:9");
    expect(visible).toEqual({ x0: 0, y0: 0.11, x1: 1, y1: 0.89 });
    const w = compositePrompt({ scene: "s", group: "web", productArea, textArea, visible });
    expect(w).toContain("between y 11% and 89% (the part of the picture that is shown)");
    expect(w).toContain("about 39% of the picture height tall");
  });
});

describe("R4-B 3:1 選比例", () => {
  it("3:1 is drawn at 21:9 by a model that takes it, else 16:9; 2:1 and 1.91:1 always 16:9", () => {
    expect(pictureAspect("r3x1", "nano-banana-2")).toBe("21:9");
    expect(pictureAspect("r3x1", "nano-banana-pro")).toBe("16:9");
    expect(pictureAspect("r3x1", "openai-25-edit")).toBe("16:9");
    expect(pictureAspect("r2x1", "nano-banana-2")).toBe("16:9");
    expect(pictureAspect("r191x1", "nano-banana-2")).toBe("16:9");
    expect(pictureAspect("r4x5", "nano-banana-2")).toBe("4:5");
  });

  it("the hint names the sizes a model narrows: 3:1 under Kontext, none under Nano Banana 2", () => {
    expect(narrowedSizes(["r3x1", "r2x1", "r4x5"], "flux-kontext-pro")).toEqual(["r3x1"]);
    expect(narrowedSizes(["r3x1", "r2x1", "r4x5"], "nano-banana-2")).toEqual([]);
  });
});
