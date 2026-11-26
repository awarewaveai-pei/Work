// Card C9 (named tests): with 多尺寸 ticked every chosen size gets its own layout override; without, nothing changes --
// no layouts, and the server's design prompt is the single-size one.
import { describe, expect, it } from "vitest";
import { forgePrompt } from "@/lib/script-forge/modules";
import { designPlan, type SizeSpec } from "./banner-design";

const ctx = { lang: "繁體中文", sceneCount: 6, customScenes: 3, brand: null };
const size = (key: string, w: number, h: number): SizeSpec => ({ key, ratio: key, use: "x", w, h });
const MAIN = size("r191x1", 1200, 630), TALL = size("r9x16", 1080, 1920), SQUARE = size("r1x1", 1080, 1080), WIDE = size("r16x9", 1920, 1080);

describe("AI 一鍵設計 across sizes", () => {
  it("every chosen size gets its own override (from the answer, else by shape)", () => {
    const raw = { headline: "x", layouts: {
      r191x1: { textAlignH: "left", productPos: "right" },
      r9x16: { textPos: "top", headlineSize: 140, positions: { product: { x: 0.5, y: 0.7 }, cta: { x: 2, y: 0.9 } } },
      r1x1: { nonsense: 1 },
    } };
    const plan = designPlan(raw, MAIN, [MAIN, TALL, SQUARE, WIDE]);
    expect(Object.keys(plan.overrides).sort()).toEqual(["r16x9", "r1x1", "r9x16"]);
    for (const o of Object.values(plan.overrides)) expect(Object.keys(o).length).toBeGreaterThan(0);
    expect(plan.overrides.r9x16).toEqual({ textPos: "top", headlineSize: 140, positions: { product: { x: 0.5, y: 0.7 }, cta: { x: 1, y: 0.9 } } });
    expect(plan.overrides.r1x1.textAlignH).toBe("center");   // left out / unusable -> square = centred
    expect(plan.overrides.r16x9.productPos).toBe("right");   // wide = words left, product right
    expect(plan.main).toEqual({ textAlignH: "left", productPos: "right" });
  });

  it("nothing ticked = as before: no layouts, and the same single-size prompt", () => {
    expect(designPlan({ headline: "x", layouts: { r191x1: { textPos: "top" } } }, MAIN, [])).toEqual({ main: {}, overrides: {} });
    const fields = { brief: "咖啡", label: "1.91:1", w: 1200, h: 630 };
    const single = forgePrompt("banner", "design", fields, ctx)!.prompt;
    expect(single).not.toContain("layouts");
    expect(forgePrompt("banner", "design", { ...fields, sizes: [] }, ctx)!.prompt).toBe(single);
    const multi = forgePrompt("banner", "design", { ...fields, sizes: [MAIN, TALL] }, ctx)!.prompt;
    expect(multi.startsWith(single)).toBe(true);
    expect(multi).toContain("r9x16");
  });
});
