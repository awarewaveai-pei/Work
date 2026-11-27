// Card R3-C (named tests): a size's background -- own picture or the main size's -- and the scene / composite prompts
// carrying the text area and the product area in the generated picture's coordinates.
import { describe, expect, it } from "vitest";
import { forgePrompt } from "@/lib/script-forge/modules";
import { boxOnPicture, compositePrompt, scenePrompt } from "./banner-design";
import { productDrawn } from "./banner-layout";
import {
  INIT, designSig, enterSize, groundingOn, leaveSize, sceneBackground, variantOf, withSharedBackground, withSizeBackgrounds, type State,
} from "./banner-state";

const A = "data:image/png;base64,AAAA", B = "data:image/png;base64,BBBBBB", C = "data:image/png;base64,CCCCCCCC";
const pic = (image: string) => ({ image, area: null });
const base: State = { ...INIT, preset: "r4x5", multiSizes: ["r9x16", "r16x9"], bgMode: "ai", bgImage: A };

describe("SIZE_KEYS 背景：沿用與覆寫", () => {
  it("a size without its own picture uses the main size's; one with its own keeps it", () => {
    const st = withSizeBackgrounds(base, { r9x16: pic(B) });
    expect(variantOf(st, "r9x16")).toMatchObject({ bgImage: B, bgImageHasProduct: true });
    expect(variantOf(st, "r16x9")).toMatchObject({ bgImage: A, bgImageHasProduct: false });
    expect(st).toMatchObject({ bgImage: A, bgMode: "ai" });
  });

  it("composite per size: the main size's picture is the main design's, each other size holds its own", () => {
    const st = withSizeBackgrounds(base, { r4x5: pic(C), r9x16: pic(B), r16x9: pic(A) });
    expect(st).toMatchObject({ bgImage: C, bgImageHasProduct: true });
    expect(st.sizeOverrides.r4x5).toBeUndefined();
    expect(variantOf(st, "r9x16").bgImage).toBe(B);
    expect(variantOf(st, "r16x9").bgImage).toBe(A);
  });

  it("a shared background (upload / scene picked) replaces every size's own picture and placement", () => {
    const own = withSizeBackgrounds(base, { r9x16: pic(B) });
    const moved: State = { ...own, sizeOverrides: { ...own.sizeOverrides, r9x16: { ...own.sizeOverrides.r9x16, bgImgX: 0.2, headlineSize: 90 } } };
    const st = withSharedBackground(moved, { bgImage: C, bgMode: "ai", bgImageHasProduct: false });
    for (const k of ["r4x5", "r9x16", "r16x9"] as const) expect(variantOf(st, k)).toMatchObject({ bgImage: C, bgImageHasProduct: false, bgImgX: 0 });
    expect(st.sizeOverrides.r9x16).toEqual({ headlineSize: 90 }); // other tweaks stay
  });

  it("while a size is tweaked, a new picture lands in its override and the size stays open", () => {
    const editing = enterSize(base, "r9x16");
    const st = withSizeBackgrounds(editing, { r9x16: pic(B) });
    expect(st.editingSize?.key).toBe("r9x16");
    expect(st.bgImage).toBe(B);                           // the live state is that size
    expect(leaveSize(st).sizeOverrides.r9x16?.bgImage).toBe(B);
    expect(leaveSize(st).bgImage).toBe(A);
  });

  it("history signature counts a size's picture by length, never its data", () => {
    const sig = designSig(withSizeBackgrounds(base, { r9x16: pic(B) }));
    expect(sig).not.toContain("BBBBBB");
    expect(sig).not.toContain(B);
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

  it("the composite puts the whole product in that size's product area and keeps the text area clear", () => {
    const p = compositePrompt({ scene: "spa counter", productArea: { x0: 0.6, y0: 0.3, x1: 0.9, y1: 0.8 }, textArea: { x0: 0.05, y0: 0.2, x1: 0.55, y1: 0.8 } });
    expect(p).toContain("Place the product inside the middle right (x 60%-90%, y 30%-80% of the picture)");
    expect(p).toContain("WHOLE product inside that area and inside the picture");
    expect(p).toContain("about 50% of the picture height");
    expect(p).toContain("Keep the middle left (x 5%-55%, y 20%-80% of the picture) clean");
  });
});
