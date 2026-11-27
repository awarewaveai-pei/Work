// 傳回 C8.3：Banner 的格子判斷——商品圖換 productImage＋productOrig；背景只換 bgImage；格子已清空 → null。
import { describe, expect, it } from "vitest";
import { applyBannerCanvasReturn } from "./banner-canvas-return";

const NEW = "data:image/png;base64,NEW";
const AREA = { x0: 0.5, y0: 0.3, x1: 0.9, y1: 0.9 };
const base = { productOrig: "O", productImage: "P", bgImage: "B", bgMode: "ai", bgImageHasProduct: true, bgProductArea: AREA, bgCanvasEdited: false, saved: true };

describe("Banner 傳回格子", () => {
  it("商品圖：productImage 與 productOrig 都換成新圖", () => {
    expect(applyBannerCanvasReturn(base, "product", NEW)).toEqual({ ...base, productOrig: NEW, productImage: NEW, saved: false });
  });

  // Codex on R3-E (F1) / R4-A (F1): the edited picture may have moved / cropped the product -> where it is now is
  // unknown: the area goes (the layout reserves productPos), still counted as baked, and the page is told to ask
  it("背景：換 bgImage、位置歸零，bgMode／bgImageHasProduct 不動，商品區清掉，提示旗標成立（R4-A F1）", () => {
    expect(applyBannerCanvasReturn({ ...base, bgImgScale: 2, bgImgX: 0.3, bgImgY: -0.1 }, "bg", NEW))
      .toEqual({ ...base, bgImage: NEW, bgProductArea: null, bgCanvasEdited: true, bgImgScale: 1, bgImgX: 0, bgImgY: 0, saved: false });
    // a background without the product: nothing to check
    expect(applyBannerCanvasReturn({ ...base, bgImageHasProduct: false }, "bg", NEW)?.bgCanvasEdited).toBe(false);
  });

  it("格子已清空 → null", () => {
    expect(applyBannerCanvasReturn({ ...base, productImage: null, productOrig: null }, "product", NEW)).toBeNull();
    expect(applyBannerCanvasReturn({ ...base, bgImage: null }, "bg", NEW)).toBeNull();
    expect(applyBannerCanvasReturn(base, "whole", NEW)).toBeNull();
  });
});
