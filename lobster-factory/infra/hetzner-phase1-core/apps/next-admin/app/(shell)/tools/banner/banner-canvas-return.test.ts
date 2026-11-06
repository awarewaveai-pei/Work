// 傳回 C8.3：Banner 的格子判斷——商品圖換 productImage＋productOrig；背景只換 bgImage；格子已清空 → null。
import { describe, expect, it } from "vitest";
import { applyBannerCanvasReturn } from "./banner-canvas-return";

const NEW = "data:image/png;base64,NEW";
const base = { productOrig: "O", productImage: "P", bgImage: "B", bgMode: "ai", bgImageHasProduct: true, saved: true };

describe("Banner 傳回格子", () => {
  it("商品圖：productImage 與 productOrig 都換成新圖", () => {
    expect(applyBannerCanvasReturn(base, "product", NEW)).toEqual({ ...base, productOrig: NEW, productImage: NEW, saved: false });
  });

  it("背景：只換 bgImage，bgMode／bgImageHasProduct 不動", () => {
    expect(applyBannerCanvasReturn(base, "bg", NEW)).toEqual({ ...base, bgImage: NEW, saved: false });
  });

  it("格子已清空 → null", () => {
    expect(applyBannerCanvasReturn({ ...base, productImage: null, productOrig: null }, "product", NEW)).toBeNull();
    expect(applyBannerCanvasReturn({ ...base, bgImage: null }, "bg", NEW)).toBeNull();
    expect(applyBannerCanvasReturn(base, "whole", NEW)).toBeNull();
  });
});
