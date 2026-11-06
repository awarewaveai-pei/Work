// canvas-handoff（R0-PLAN 2026-11-05-photocraft-pro C7.1、C8.1）：交接表；一律開新分頁、交接只走 IndexedDB 一筆＋?h=<id>；
// 分頁被擋退回同分頁；editor 不符不取；開成功（done）才刪。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CANVAS_STAFF_HREF, canvasTarget, issuedReturnTickets, openInCanvas, takeCanvasHandoff,
} from "./canvas-handoff";

/** Minimal IndexedDB: one store, put/get/delete/openKeyCursor, events fired on a microtask (enough for canvas-handoff.ts). */
function fakeIndexedDB() {
  const data = new Map<string, unknown>();
  const later = (fn: () => void) => queueMicrotask(fn);
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore() {},
    close() {},
    transaction() {
      const tx: Record<string, any> = {};
      const complete = () => later(() => tx.oncomplete?.());
      tx.objectStore = () => ({
        put: (v: unknown, k: string) => { data.set(k, structuredClone(v)); complete(); return {}; },
        delete: (k: string) => { data.delete(k); complete(); return {}; },
        get: (k: string) => { const r: Record<string, any> = {}; later(() => { r.result = data.get(k); r.onsuccess?.(); }); return r; },
        openKeyCursor: () => {
          const keys = [...data.keys()];
          let i = 0;
          const r: Record<string, any> = {};
          const step = () => later(() => {
            r.result = i < keys.length ? { key: keys[i], continue: () => { i++; step(); } } : null;
            r.onsuccess?.();
            if (!r.result) complete();
          });
          step();
          return r;
        },
      });
      return tx;
    },
  };
  return { data, api: { open() { const r: Record<string, any> = { result: db }; later(() => { r.onupgradeneeded?.(); r.onsuccess?.(); }); return r; } } };
}

let idb: ReturnType<typeof fakeIndexedDB>;
let tab: { opener: unknown; location: { href: string } } | null;
const assign = vi.fn();
const session = { setItem: vi.fn(), getItem: vi.fn(() => null), removeItem: vi.fn() };
const loc = { assign, search: "" };
beforeEach(() => {
  idb = fakeIndexedDB();
  tab = { opener: {}, location: { href: "" } };
  assign.mockReset();
  session.setItem.mockReset();
  loc.search = "";
  issuedReturnTickets.clear();
  vi.stubGlobal("indexedDB", idb.api);
  vi.stubGlobal("sessionStorage", session);
  vi.stubGlobal("window", { open: vi.fn(() => tab), location: loc });
});
afterEach(() => vi.unstubAllGlobals());

/** The editor tab's view: its URL carries the handoff id. */
const editorSees = (url: string) => { loc.search = new URL(url, "http://x").search; };
const idOf = (url: string) => new URL(url, "http://x").searchParams.get("h")!;

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
  it("新分頁開到 ?h=<id>；交接只在 IndexedDB 一筆、不寫 sessionStorage；開成功前不刪（重新整理再試），done() 後刪", async () => {
    await openInCanvas("data:image/jpeg;base64,AAAA", "商品圖-月亮", "/tools/photo-pro");
    expect(assign).not.toHaveBeenCalled();
    expect(tab!.location.href).toMatch(/^\/tools\/photo-pro\?h=[0-9a-z]+-[0-9a-z]+$/);
    expect(tab!.opener).toBeNull();
    expect(session.setItem).not.toHaveBeenCalled();
    expect([...idb.data.keys()]).toEqual([`handoff:${idOf(tab!.location.href)}`]);
    editorSees(tab!.location.href);
    const h = await takeCanvasHandoff("photocraft");
    expect(h).toMatchObject({ url: "data:image/jpeg;base64,AAAA", name: "商品圖-月亮.jpg" });
    expect(h!.ret).toBeUndefined();
    expect(await takeCanvasHandoff("photocraft")).toMatchObject({ name: "商品圖-月亮.jpg" });
    h!.done();
    await new Promise((r) => setTimeout(r, 0));
    expect(idb.data.size).toBe(0);
    expect(await takeCanvasHandoff("photocraft")).toBeNull();
  });

  it("分頁被擋（window.open 回 null）→ 同分頁開；票不登記（這頁會離開，傳回只能走 My Designs）", async () => {
    tab = null;
    await openInCanvas("data:image/png;base64,AAAA", "x", "/tools/photo-pro", undefined, { tool: "tarot", slot: "preview", label: "塔羅預覽" });
    expect(assign).toHaveBeenCalledWith(expect.stringMatching(/^\/tools\/photo-pro\?h=/));
    expect(issuedReturnTickets.size).toBe(0);
    editorSees(assign.mock.calls[0][0]);
    expect(await takeCanvasHandoff("photocraft")).toMatchObject({ name: "x.png", ret: { label: "塔羅預覽" } });
  });

  it("帶票：本分頁記住票，編輯器拿到 ret = { id, label }", async () => {
    const ret = { tool: "tarot", slot: "preview", label: "塔羅預覽" };
    await openInCanvas("data:image/png;base64,AAAA", "x", "/tools/photo-pro", undefined, ret);
    const id = idOf(tab!.location.href);
    expect(issuedReturnTickets.get(id)).toEqual(ret);
    editorSees(tab!.location.href);
    expect((await takeCanvasHandoff("photocraft"))!.ret).toEqual({ id, label: "塔羅預覽" });
  });

  it("有原始檔：開原始檔（走同源下載路由），不開預覽圖", async () => {
    const src = { url: "https://pub-x.r2.dev/a/src.vectorcraft", name: "design.vectorcraft" };
    await openInCanvas("https://pub-x.r2.dev/a/prev.png", "design", "/tools/vector-pro", src);
    editorSees(tab!.location.href);
    expect(await takeCanvasHandoff("vectorcraft")).toMatchObject({
      url: `/api/tools/designs/download?url=${encodeURIComponent(src.url)}`,
      name: "design.vectorcraft",
    });
  });

  it("editor 不符不取也不刪：畫布交接留給畫布", async () => {
    await openInCanvas("data:image/png;base64,AAAA", "x", "/tools/photo-pro");
    editorSees(tab!.location.href);
    expect(await takeCanvasHandoff("vectorcraft")).toBeNull();
    expect(idb.data.size).toBe(1);
    expect(await takeCanvasHandoff("photocraft")).toMatchObject({ name: "x.png" });
  });

  it("沒有 ?h= 或紀錄不在 → null；壞紀錄被刪", async () => {
    expect(await takeCanvasHandoff("photocraft")).toBeNull();
    loc.search = "?h=nope";
    expect(await takeCanvasHandoff("photocraft")).toBeNull();
    idb.data.set("handoff:bad", "junk");
    loc.search = "?h=bad";
    expect(await takeCanvasHandoff("photocraft")).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(idb.data.has("handoff:bad")).toBe(false);
  });
});
