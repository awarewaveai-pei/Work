import { describe, it, expect } from "vitest";
import { reassignSceneVisuals, type VideoScene } from "../video-script-core";

// 造一組場景，visual 由 pattern 字串決定（c=custom, b=broll）。
function scenes(pattern: string): VideoScene[] {
  return pattern.split("").map((ch, i) => ({
    id: i + 1,
    narration: `n${i + 1}`,
    image_prompt: `p${i + 1}`,
    broll_keyword: `k${i + 1}`,
    visual: ch === "c" ? "custom" : "broll",
  }));
}
const customCount = (s: VideoScene[]) => s.filter((x) => x.visual === "custom").length;

describe("reassignSceneVisuals", () => {
  it("全 custom，要 3 → 恰 3 custom（尾端降為 broll）", () => {
    const s = scenes("cccccc");
    reassignSceneVisuals(s, 3);
    expect(customCount(s)).toBe(3);
    expect(s.map((x) => x.visual)).toEqual(["custom", "custom", "custom", "broll", "broll", "broll"]);
  });

  it("全 broll，要 3 → 恰 3 custom（從頭補）", () => {
    const s = scenes("bbbbbb");
    reassignSceneVisuals(s, 3);
    expect(customCount(s)).toBe(3);
    expect(s.map((x) => x.visual)).toEqual(["custom", "custom", "custom", "broll", "broll", "broll"]);
  });

  it("混合 2 custom，要 4 → 補到 4（保留既有 custom）", () => {
    const s = scenes("cbbcbb");
    reassignSceneVisuals(s, 4);
    expect(customCount(s)).toBe(4);
  });

  it("混合 4 custom，要 1 → 降到 1", () => {
    const s = scenes("ccbccb");
    reassignSceneVisuals(s, 1);
    expect(customCount(s)).toBe(1);
  });

  it("要 0 → 全 broll", () => {
    const s = scenes("ccc");
    reassignSceneVisuals(s, 0);
    expect(customCount(s)).toBe(0);
  });

  it("要超過場數 → clamp 到場數", () => {
    const s = scenes("cbb");
    reassignSceneVisuals(s, 99);
    expect(customCount(s)).toBe(3);
  });

  it("小數四捨五入：2.6 → 3", () => {
    const s = scenes("bbbbbb");
    reassignSceneVisuals(s, 2.6);
    expect(customCount(s)).toBe(3);
  });

  it("負數 → clamp 0", () => {
    const s = scenes("ccc");
    reassignSceneVisuals(s, -5);
    expect(customCount(s)).toBe(0);
  });

  it("NaN → 不動（安全 no-op，保留原 visual）", () => {
    const s = scenes("cbcb");
    reassignSceneVisuals(s, NaN);
    expect(s.map((x) => x.visual)).toEqual(["custom", "broll", "custom", "broll"]);
  });

  it("Infinity → 不動（非有限數 no-op）", () => {
    const s = scenes("cbcb");
    reassignSceneVisuals(s, Infinity);
    expect(customCount(s)).toBe(2);
  });
});
