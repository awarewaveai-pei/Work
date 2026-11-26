// Card C11 (named tests): the 尺寸 buttons are a multi-select -- press adds / drops, dropping the size being edited moves
// editing to the first size left, and with one size picked nothing differs from the single-size tool.
import { describe, expect, it } from "vitest";
import { INIT, editingSizeOf, selectedSizes, toggleSizePick, type State } from "./banner-state";

const base: State = { ...INIT, preset: "r191x1", headlineSize: 64 };

describe("尺寸 multi-select", () => {
  it("press adds a size, press again drops it; the last one stays", () => {
    const two = toggleSizePick(base, "r9x16");
    expect(selectedSizes(two)).toEqual(["r9x16", "r191x1"]);
    expect(two.preset).toBe("r191x1");
    expect(editingSizeOf(two)).toBe("r191x1");
    const back = toggleSizePick(two, "r9x16");
    expect(selectedSizes(back)).toEqual(["r191x1"]);
    expect(toggleSizePick(back, "r191x1")).toBe(back);
  });

  it("dropping the size being edited edits the first size left", () => {
    let st = toggleSizePick(toggleSizePick(base, "r9x16"), "r1x1");            // picked: 9:16, 1:1, 1.91:1 (main)
    st = toggleSizePick(toggleSizePick(st, "r1x1"), "r1x1");                    // drop + re-add keeps the main
    // edit 9:16, then drop it -> editing moves to 1:1 (first left); the main size stays 1.91:1
    const editing916: State = { ...st, preset: "r9x16", editingSize: { key: "r9x16", main: { preset: "r191x1", headlineSize: 64 } } };
    const after = toggleSizePick(editing916, "r9x16");
    expect(selectedSizes(after)).toEqual(["r1x1", "r191x1"]);
    expect(editingSizeOf(after)).toBe("r1x1");
    // drop the main size while editing it -> the first size left becomes the main one and is edited
    const mainDropped = toggleSizePick(st, "r191x1");
    expect(selectedSizes(mainDropped)).toEqual(["r9x16", "r1x1"]);
    expect(mainDropped.preset).toBe("r9x16");
    expect(editingSizeOf(mainDropped)).toBe("r9x16");
  });

  it("one size picked = the single-size tool: nothing added to the design", () => {
    expect(selectedSizes(base)).toEqual(["r191x1"]);
    expect(editingSizeOf(base)).toBe("r191x1");
    expect(toggleSizePick(base, "r191x1")).toBe(base);
    // old data that listed the main size in multiSizes still loads as the same pick
    expect(selectedSizes({ ...base, multiSizes: ["r191x1"] })).toEqual(["r191x1"]);
  });
});

// Codex round 2 (C13): the guidance line covers only a design nobody touched; a background colour alone shows the preview.
describe("empty-preview guidance", () => {
  it("only the untouched design counts as empty", async () => {
    const { isUntouched } = await import("./banner-state");
    expect(isUntouched(INIT)).toBe(true);
    expect(isUntouched({ ...INIT, copyBrief: "咖啡", multiSizes: ["r9x16"] })).toBe(true);   // the topic and sizes are not the picture
    expect(isUntouched({ ...INIT, bgColor: "#123456" })).toBe(false);
    expect(isUntouched({ ...INIT, bgMode: "gradient" })).toBe(false);
    expect(isUntouched({ ...INIT, gradFrom: "#000000" })).toBe(false);
  });
});

// R2-B1 (PLAN-R2 §4): 清除設計 = the blank design, keeping the picked sizes; a size being tweaked comes back as its main size.
describe("清除設計", () => {
  it("keeps the picked sizes, clears everything else", async () => {
    const { clearDesign, designSig } = await import("./banner-state");
    const st: State = {
      ...toggleSizePick(base, "r9x16"), headline: "夏日", copyBrief: "咖啡", bgColor: "#123456",
      sizeOverrides: { r9x16: { textPos: "top" } },
    };
    const tweaking: State = { ...st, preset: "r9x16", editingSize: { key: "r9x16", main: { preset: "r191x1", headlineSize: 64 } } };
    for (const s of [st, tweaking]) {
      const c = clearDesign(s);
      expect(selectedSizes(c)).toEqual(["r9x16", "r191x1"]);
      expect(c.preset).toBe("r191x1");
      expect(designSig({ ...c, preset: INIT.preset, multiSizes: [] })).toBe(designSig(INIT));
    }
  });
});

// Codex review of R2-B1: clearing within the 500 ms typing debounce lost the step before it; a copy list alone could not
// be cleared (designSig leaves copyVariants out).
describe("清除設計 and undo", () => {
  it("title typed then cleared at once -> undo returns the title", async () => {
    const { clearDesign, pushHistory } = await import("./banner-state");
    const typed: State = { ...INIT, headline: "夏日咖啡" };          // typed, the 500 ms timer not fired yet
    let h = { hist: [INIT], idx: 0 };
    h = pushHistory(h.hist, h.idx, typed, true);                   // commitHistoryNow: the current state first
    h = pushHistory(h.hist, h.idx, clearDesign(typed), true);      // then the cleared design as its own step
    expect(h.hist[h.idx].headline).toBe("");
    expect(h.hist[h.idx - 1].headline).toBe("夏日咖啡");
  });

  it("a copy list alone can be cleared, and undo brings it back", async () => {
    const { canClear, clearDesign, pushHistory } = await import("./banner-state");
    const listed: State = { ...INIT, copyVariants: [{ headline: "甲", subtext: "乙" }] };
    expect(canClear(INIT)).toBe(false);
    expect(canClear(listed)).toBe(true);
    // the list never got its own step: by design it equals the blank step before it
    let h = { hist: [INIT], idx: 0 };
    h = pushHistory(h.hist, h.idx, listed);
    expect(h.idx).toBe(0);
    h = pushHistory(h.hist, h.idx, listed, true);                  // commitHistoryNow
    h = pushHistory(h.hist, h.idx, clearDesign(listed), true);
    expect(h.hist[h.idx - 1].copyVariants).toHaveLength(1);
  });
});
