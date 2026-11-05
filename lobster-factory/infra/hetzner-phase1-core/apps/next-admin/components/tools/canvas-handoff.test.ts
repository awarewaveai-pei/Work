// canvas-handoff（R0-PLAN 2026-11-05-photocraft-pro C7.1）：交接表、editor 不符不取、讀完即清。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CANVAS_NAME_KEY, CANVAS_SOURCE_KEY, CANVAS_STAFF_HREF, CANVAS_TARGET_KEY,
  canvasTarget, openInCanvas, readCanvasSource, takeCanvasHandoff,
} from "./canvas-handoff";

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  get size() { return this.m.size; }
}

let store: MemStorage;
const assign = vi.fn();
beforeEach(() => {
  store = new MemStorage();
  assign.mockReset();
  vi.stubGlobal("sessionStorage", store);
  vi.stubGlobal("window", { location: { assign } });
});
afterEach(() => vi.unstubAllGlobals());

describe("交接表 canvasTarget", () => {
  it.each([
    ["design.vectorcraft", "vectorcraft", "/tools/vector-pro"],
    ["logo.SVG", "vectorcraft", "/tools/vector-pro"],
    ["design.psd", "photocraft", "/tools/photo-pro"],
    ["design.pcraft", "photocraft", "/tools/photo-pro"],
    [undefined, "photocraft", "/tools/photo-pro"],
  ])("%s → %s", (name, editor, href) => {
    expect(canvasTarget(name)).toEqual({ editor, staffHref: href });
  });
  it("CANVAS_STAFF_HREF = 沒有原始檔時的目的地（畫布專業版）", () => {
    expect(CANVAS_STAFF_HREF).toBe("/tools/photo-pro");
  });
});

describe("openInCanvas → takeCanvasHandoff", () => {
  it("圖片交接給畫布：取到同源網址＋帶副檔名的檔名，之後全部清掉", async () => {
    await openInCanvas("data:image/jpeg;base64,AAAA", "商品圖-月亮", "/tools/photo-pro");
    expect(assign).toHaveBeenCalledWith("/tools/photo-pro");
    expect(await takeCanvasHandoff("photocraft")).toEqual({ url: "data:image/jpeg;base64,AAAA", name: "商品圖-月亮.jpg" });
    expect(store.size).toBe(0);
    expect(await takeCanvasHandoff("photocraft")).toBeNull();
  });

  it("有原始檔：開原始檔（走同源下載路由），不開預覽圖", async () => {
    const src = { url: "https://pub-x.r2.dev/a/src.vectorcraft", name: "design.vectorcraft" };
    await openInCanvas("https://pub-x.r2.dev/a/prev.png", "design", "/tools/vector-pro", src);
    expect(await takeCanvasHandoff("vectorcraft")).toEqual({
      url: `/api/tools/designs/download?url=${encodeURIComponent(src.url)}`,
      name: "design.vectorcraft",
    });
    expect(store.size).toBe(0);
  });

  it("editor 不符不取：畫布交接留給畫布，向量頁拿不到也不清", async () => {
    await openInCanvas("data:image/png;base64,AAAA", "x", "/tools/photo-pro");
    expect(await takeCanvasHandoff("vectorcraft")).toBeNull();
    expect(store.getItem(CANVAS_TARGET_KEY)).not.toBeNull();
    expect(store.getItem(CANVAS_SOURCE_KEY)).toBe("data:image/png;base64,AAAA");
    expect(await takeCanvasHandoff("photocraft")).toEqual({ url: "data:image/png;base64,AAAA", name: "x.png" });
  });

  it("舊 Fabric 編輯器（readCanvasSource）不取專業版的交接", async () => {
    await openInCanvas("data:image/png;base64,AAAA", undefined, "/tools/photo-pro");
    expect(await readCanvasSource()).toBeNull();
    expect(store.getItem(CANVAS_SOURCE_KEY)).not.toBeNull();
  });

  it("沒有交接 → null；壞掉的 target 被清掉、不交給任何人", async () => {
    expect(await takeCanvasHandoff("photocraft")).toBeNull();
    store.setItem(CANVAS_TARGET_KEY, "{bad");
    store.setItem(CANVAS_SOURCE_KEY, "data:image/png;base64,AAAA");
    store.setItem(CANVAS_NAME_KEY, "x");
    expect(await takeCanvasHandoff("photocraft")).toBeNull();
    expect(store.size).toBe(0);
  });
});
