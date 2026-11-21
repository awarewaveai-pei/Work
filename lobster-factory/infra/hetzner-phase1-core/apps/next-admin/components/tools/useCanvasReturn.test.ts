// @vitest-environment jsdom
// 傳回（R0-PLAN 2026-11-05-photocraft-pro C8.1）：原分頁 useCanvasReturn ↔ 編輯器 dock.js postReturn／sendBack，走真的 BroadcastChannel。
// 不變量：圖一定落地一處——票是自己的且 onReturn 回 true 才 ack；沒 ack 就存 My Designs。
import { BroadcastChannel as NodeBroadcastChannel } from "node:worker_threads";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issuedReturnTickets } from "./canvas-handoff";
import { useCanvasReturn } from "./useCanvasReturn";
import { mountDock, postReturn, sendBack } from "../../public/editor-shared/dock.js";

const IMG = "data:image/png;base64,AAAA";
let unmount: (() => void) | null = null;
beforeEach(() => {
  issuedReturnTickets.clear();
  if (typeof globalThis.BroadcastChannel === "undefined") vi.stubGlobal("BroadcastChannel", NodeBroadcastChannel);
});
afterEach(() => {
  unmount?.();
  unmount = null;
  vi.unstubAllGlobals();
});

function senderTab(tool: string, onReturn: (slot: string, image: string) => boolean | Promise<boolean>) {
  const spy = vi.fn(onReturn);
  unmount = renderHook(() => useCanvasReturn(tool, spy)).unmount;
  return spy;
}

describe("原分頁 useCanvasReturn", () => {
  it("自己發的票、onReturn 回 true → ack；收到那一格與圖", async () => {
    issuedReturnTickets.set("t1", { tool: "tarot", slot: "preview", label: "塔羅預覽" });
    const got = senderTab("tarot", () => true);
    expect(await postReturn("t1", IMG, 1000)).toBe(true);
    expect(got).toHaveBeenCalledWith("preview", IMG);
  });

  it("票對不上（別分頁發的、別的工具的）不收、不 ack", async () => {
    issuedReturnTickets.set("t2", { tool: "studio", slot: "result:a", label: "Studio" });
    const got = senderTab("tarot", () => true);
    expect(await postReturn("other-tab", IMG, 200)).toBe(false);
    expect(await postReturn("t2", IMG, 200)).toBe(false);
    expect(got).not.toHaveBeenCalled();
  });

  it("onReturn 回 false（那一格已不在）→ 不 ack", async () => {
    issuedReturnTickets.set("t3", { tool: "tarot", slot: "deck:1:0", label: "第 1 張" });
    const got = senderTab("tarot", async () => false);
    expect(await postReturn("t3", IMG, 200)).toBe(false);
    expect(got).toHaveBeenCalledOnce();
  });
});

describe("編輯器 sendBack", () => {
  const ctx = { exportArtboard: vi.fn(async () => new Blob(["png"], { type: "image/png" })) };

  it("沒 ack（原分頁已關）→ 存 My Designs（同一張 PNG）並說明", async () => {
    const save = vi.fn(async () => ({ ok: true }));
    const report = vi.fn();
    expect(await sendBack(ctx, { id: "gone", label: "塔羅預覽" }, report, { ackMs: 100, save })).toBe("saved");
    expect(save).toHaveBeenCalledWith(ctx, expect.any(Blob), { previewOnlyIfTooBig: true });
    expect(report).toHaveBeenLastCalledWith("原分頁已關，已存進我的設計");
  });

  it("票的 saveAs = 存進 My Designs 的分類（模特兒圖／合成圖不落在設計圖）", async () => {
    const save = vi.fn(async () => ({ ok: true }));
    expect(await sendBack(ctx, { id: "gone", label: "模特兒圖庫", saveAs: "mockup" }, vi.fn(), { ackMs: 50, save })).toBe("saved");
    expect(save).toHaveBeenCalledWith(ctx, expect.any(Blob), { previewOnlyIfTooBig: true, source: "mockup" });
  });

  it("沒 ack 且存檔失敗（網路／伺服器）→ PNG 下載到電腦，不會兩處都沒有", async () => {
    const save = vi.fn(async () => ({ ok: false, message: "HTTP 500" }));
    const download = vi.fn();
    expect(await sendBack(ctx, { id: "gone", label: "塔羅預覽" }, vi.fn(), { ackMs: 50, save, download })).toBe("downloaded");
    expect(download).toHaveBeenCalledWith(expect.any(Blob), "塔羅預覽.png");
  });

  it("沒 ack 時退路要求原檔過大只存預覽（不因 64MB 上限而失敗）", async () => {
    const { saveToMyDesigns } = await import("../../public/editor-shared/blocks/my-designs.js");
    const posts: any[] = [];
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    vi.stubGlobal("fetch", async (u: string, init: RequestInit) => {
      if (u === "/api/tools/designs/upload-url") return ok({ ok: true, key: "k", putUrl: "https://r2.put/x", contentType: "image/png" });
      if (init.method === "PUT") return ok({});
      posts.push(JSON.parse(String(init.body)));
      return ok({ ok: true });
    });
    const big = { size: 65 * 1024 * 1024 } as Blob;
    const host = { sourceName: "design.psd", saveTag: { source: "canvas", modelName: "canvas", prompt: "canvas edit" } };
    const c = { host, saveAs: async () => big, exportArtboard: ctx.exportArtboard };
    const save = vi.fn((cc: any, png: Blob, o: any) => saveToMyDesigns(cc, png, o));
    const report = vi.fn();
    expect(await sendBack(c, { id: "gone", label: "x" }, report, { ackMs: 50, save })).toBe("saved");
    expect(posts[0].sourceUpload).toBeUndefined();
    expect(posts[0].upload).toEqual({ key: "k" });
    expect(report).toHaveBeenLastCalledWith("原分頁已關，已存進我的設計（原檔超過 64MB，只存了預覽圖）");
    expect(await saveToMyDesigns(c, new Blob(["p"], { type: "image/png" }))).toMatchObject({ ok: false }); // 面板照舊拒絕
  });

  it("有 ack → 不存 My Designs", async () => {
    issuedReturnTickets.set("t4", { tool: "banner", slot: "product", label: "商品圖" });
    senderTab("banner", () => true);
    const save = vi.fn(async () => ({ ok: true }));
    const report = vi.fn();
    expect(await sendBack(ctx, { id: "t4", label: "商品圖" }, report, { ackMs: 1000, save })).toBe("returned");
    expect(save).not.toHaveBeenCalled();
    expect(report).toHaveBeenLastCalledWith("✅ 已傳回 商品圖");
  });
});

describe("dock 的傳回鈕（2026-11-20 操作者：傳回成功就關掉編輯器；訊息框不要全高蓋住控制項）", () => {
  const SIZES = { rail: 40, button: 32, panel: 300, panelMin: 200, panelMax: 600, tab: 32, pad: 8 };
  async function clickReturn(ticket: string) {
    vi.stubGlobal("fetch", async () => ({ ok: true, blob: async () => new Blob(["x"]) }));
    vi.stubGlobal("__proEditor", { handoff: Promise.resolve({ url: "blob:x", name: "a.png", ret: { id: ticket, label: "模特兒圖庫" }, done() {} }) });
    const close = vi.spyOn(window, "close").mockImplementation(() => {});
    const root = document.createElement("div");
    document.body.append(root);
    const c = { ready: () => Promise.resolve(), openFile: async () => true, exportArtboard: async () => new Blob(["png"], { type: "image/png" }), busy() {} };
    await mountDock(root, { makeCtx: () => c, panelIds: [], storeKey: "t", sizes: SIZES });
    await vi.waitFor(() => expect(root.querySelector("[data-return]")).not.toBeNull());
    (root.querySelector("[data-return]") as HTMLButtonElement).click();
    await vi.waitFor(() => expect((root.querySelector("[data-return]") as HTMLButtonElement).disabled).toBe(false), { timeout: 4000 });
    return { close, flyout: root.querySelector(".vp-flyout")! };
  }

  it("原分頁收下 → 關掉這個分頁；訊息浮出層是 vp-notice（只到訊息高度）", async () => {
    issuedReturnTickets.set("t5", { tool: "mockup-model", slot: "lib:x", label: "模特兒圖庫" });
    senderTab("mockup-model", () => true);
    const { close, flyout } = await clickReturn("t5");
    expect(close).toHaveBeenCalledOnce();
    expect(flyout.classList.contains("vp-notice")).toBe(true);
  });

  it("原分頁沒收下 → 不關（改存／下載的訊息要讓人看到）", async () => {
    const { close } = await clickReturn("nobody");
    expect(close).not.toHaveBeenCalled();
  }, 8000);
});
