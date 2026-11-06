// 傳回 C8.3：Studio 的格子判斷——還在就換那一格，不在回 null（→ dock 存 My Designs），不落到別格。
import { describe, expect, it } from "vitest";
import { newRefImage, parseStudioSlot, refSlot, replaceRefImage, replaceResultImage, resultSlot } from "./studio-canvas-return";

const NEW = "data:image/png;base64,NEW";

describe("Studio 傳回格子", () => {
  it("結果：換該模型那一筆（不看 activeIdx），seed 不變", () => {
    const results = [
      { model: "a", image: "A", seed: 1, busy: false },
      { model: "b", image: "B", seed: 2, busy: false },
    ];
    const next = replaceResultImage(results, "b", NEW)!;
    expect(next[1]).toEqual({ model: "b", image: NEW, seed: 2, busy: false });
    expect(next[0]).toBe(results[0]);
  });

  it("結果：該模型已不在或那筆沒圖 → null", () => {
    expect(replaceResultImage([{ model: "a", image: "A" }], "b", NEW)).toBeNull();
    expect(replaceResultImage([{ model: "b", image: null }], "b", NEW)).toBeNull();
  });

  it("參考圖：用穩定 id 換那一張；中途移除前一張不錯位", () => {
    const r1 = newRefImage("R1"), r2 = newRefImage("R2");
    expect(r1.id).not.toBe(r2.id);
    const afterRemove = [r2]; // r1 removed while r2 was in the editor
    expect(replaceRefImage(afterRemove, r2.id, NEW)).toEqual([{ id: r2.id, url: NEW }]);
  });

  it("參考圖：那張已移除 → null", () => {
    const r1 = newRefImage("R1"), r2 = newRefImage("R2");
    expect(replaceRefImage([r2], r1.id, NEW)).toBeNull();
  });

  it("slot 字串來回", () => {
    expect(parseStudioSlot(resultSlot("flux-dev"))).toEqual({ kind: "result", model: "flux-dev" });
    expect(parseStudioSlot(refSlot("ref3-x"))).toEqual({ kind: "ref", id: "ref3-x" });
    expect(parseStudioSlot("preview")).toBeNull();
  });
});
