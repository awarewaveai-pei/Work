// @vitest-environment jsdom
// 傳回（R0-PLAN 2026-11-05-photocraft-pro C8.1）：原分頁 useCanvasReturn ↔ 編輯器 dock.js postReturn／sendBack，走真的 BroadcastChannel。
// 不變量：圖一定落地一處——票是自己的且 onReturn 回 true 才 ack；沒 ack 就存 My Designs。
import { BroadcastChannel as NodeBroadcastChannel } from "node:worker_threads";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issuedReturnTickets } from "./canvas-handoff";
import { useCanvasReturn } from "./useCanvasReturn";
import { postReturn, sendBack } from "../../public/editor-shared/dock.js";

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
    expect(save).toHaveBeenCalledWith(ctx, expect.any(Blob));
    expect(report).toHaveBeenLastCalledWith("原分頁已關，已存進我的設計");
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
