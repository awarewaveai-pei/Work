// Card C9 (named tests): with 多尺寸 ticked every chosen size gets its own layout override; without, nothing changes --
// no layouts, and the server's design prompt is the single-size one.
import { describe, expect, it } from "vitest";
import { forgePrompt } from "@/lib/script-forge/modules";
import { askJsonWithRetry, designPlan, parseAiJson, type SizeSpec } from "./banner-design";

const ctx = { lang: "繁體中文", sceneCount: 6, customScenes: 3, brand: null };
const size = (key: string, w: number, h: number): SizeSpec => ({ key, ratio: key, use: "x", w, h });
const MAIN = size("r191x1", 1200, 630), TALL = size("r9x16", 1080, 1920), SQUARE = size("r1x1", 1080, 1080), WIDE = size("r16x9", 1920, 1080);

describe("AI 一鍵設計 across sizes", () => {
  it("every chosen size gets its own override (from the answer, else by shape)", () => {
    const raw = { headline: "x", layouts: {
      r191x1: { textAlignH: "left", productPos: "right" },
      // an old-style answer: pixel sizes and coordinates are dropped, only the intent stays
      r9x16: { textPos: "top", badgePos: "tr", logoPos: "nowhere", headlineSize: 140, positions: { product: { x: 0.5, y: 0.7 } } },
      r1x1: { nonsense: 1 },
    } };
    const plan = designPlan(raw, MAIN, [MAIN, TALL, SQUARE, WIDE]);
    expect(Object.keys(plan.overrides).sort()).toEqual(["r16x9", "r1x1", "r9x16"]);
    for (const o of Object.values(plan.overrides)) expect(Object.keys(o).length).toBeGreaterThan(0);
    expect(plan.overrides.r9x16).toEqual({ textPos: "top", badgePos: "tr" });
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

// C10 (named): an answer holding one complete object is usable; a broken one is asked once more.
describe("reading the AI's JSON answer", () => {
  const want = { headline: "夏日**限定**", layouts: { r9x16: { textPos: "top" } } };
  const body = JSON.stringify(want);
  it.each([
    ["words around it", `好的，以下是設計：
${body}
希望你喜歡！`],
    ["a code fence", "```json\n" + body + "\n```"],
    ["trailing commas", '{"headline":"夏日**限定**","layouts":{"r9x16":{"textPos":"top",},},}'],
    ["a [SF_BUDGET] receipt at the end", `${body}
[SF_BUDGET]{"spentTwd":1.51,"estimated":false}`],
  ])("parses with %s", (_name, text) => {
    expect(parseAiJson(text)).toEqual({ ok: true, value: want });
  });
  it("first answer broken, second good -> applied after 2 calls", async () => {
    const answers = ['{"headline": "壞掉', body];
    let calls = 0, retried = 0;
    const got = await askJsonWithRetry(async () => answers[calls++], () => { retried++; });
    expect(got).toEqual({ ok: true, value: want, calls: 2 });
    expect(calls).toBe(2);
    expect(retried).toBe(1);
  });
});
