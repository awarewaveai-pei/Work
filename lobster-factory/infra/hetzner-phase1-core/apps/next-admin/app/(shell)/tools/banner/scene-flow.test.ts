// Card R4-D (named tests): a candidate click spends nothing; the other-sizes button's price; the other sizes extend the
// picked picture into each size's product area; both entries run the one scene flow.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { INIT, IN_FLIGHT, restoreSnapshot, toggleSizePick, variantOf, type PresetKey, type State } from "./banner-state";
import { EMPTY_VIEW, imageNtd, otherSizesLabel, otherSizesNtd, otherSizesOf, sceneFlow, type FlowView, type OkCell, type SceneSource } from "./scene-flow";

const PRODUCT = "data:image/png;base64,PPPP", SCENE = "data:image/png;base64,SSSS";
const areaOf: Record<string, { x0: number; y0: number; x1: number; y1: number }> = {
  r4x5: { x0: 0.3, y0: 0.5, x1: 0.7, y1: 0.95 }, r9x16: { x0: 0.25, y0: 0.6, x1: 0.75, y1: 0.95 }, r16x9: { x0: 0.6, y0: 0.2, x1: 0.95, y1: 0.9 },
};
const areas = vi.fn(async (_v: State, k: PresetKey) => ({
  text: { x0: 0.05, y0: 0.05, x1: 0.55, y1: 0.4 }, product: areaOf[k], aspect: PRESETS_ASPECT[k], visible: { x0: 0, y0: 0, x1: 1, y1: 1 },
}));
const PRESETS_ASPECT: Record<string, "4:5" | "9:16" | "16:9"> = { r4x5: "4:5", r9x16: "9:16", r16x9: "16:9" };
const src: SceneSource = { scene: "spa counter", product: PRODUCT, model: "nano-banana-2", styleRefs: [] };

function harness(start: State) {
  let st = start, view: FlowView = EMPTY_VIEW;
  const generate = vi.fn(async () => SCENE);
  const flow = sceneFlow({
    current: () => st, apply: (fn) => { st = fn(st); }, view: (fn) => { view = fn(view); },
    check: async () => ({ patch: {}, unmet: [] } as never), generate, areas,
  });
  return { flow, generate, state: () => st, view: () => view };
}
const design: State = { ...INIT, preset: "r4x5", multiSizes: ["r9x16", "r16x9"], productImage: PRODUCT, aiBgCompositeProduct: true };
const cell: OkCell = { state: "ok", image: SCENE, product: PRODUCT, area: areaOf.r4x5 };

describe("R4-D 點縮圖＝免費預覽", () => {
  it("picking a candidate applies it to the main size and calls no generation", async () => {
    const h = harness(design);
    expect(await h.flow.pick(0, cell)).toBe(true);
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.state()).toMatchObject({ bgImage: SCENE, bgImageHasProduct: true, bgProductArea: areaOf.r4x5 });
    expect(variantOf(h.state(), "r9x16").bgImage).toBe(SCENE); // other sizes crop it until the paid button
    expect(h.view().picked).toBe(0);
  });
});

describe("R4-D 生成其他尺寸的價錢", () => {
  it("the button's price = other sizes × the price of one picture on the model that draws them", () => {
    expect(otherSizesNtd(2, "nano-banana-2", "extend")).toBeCloseTo(2 * imageNtd("nano-banana-2"));
    expect(otherSizesNtd(3, "openai-medium", "extend")).toBeCloseTo(3 * imageNtd("openai-medium"));
    // FLUX Kontext takes one reference: extending (picture + product) runs on Nano Banana 2 and is priced so
    expect(otherSizesNtd(2, "flux-kontext-pro", "extend")).toBeCloseTo(2 * imageNtd("nano-banana-2"));
    expect(otherSizesLabel(2, "nano-banana-2", "extend")).toMatch(/^生成其他 2 個尺寸（約 NT\$/);
  });
});

describe("R4-D 其他尺寸＝延伸選中的圖", () => {
  it("each other size is one call: the picked picture then the product as references, that size's ratio and product area", async () => {
    const h = harness(design);
    await h.flow.pick(0, cell);
    await h.flow.drawOthers(cell, src, "extend");
    expect(h.generate).toHaveBeenCalledTimes(2);
    for (const k of ["r9x16", "r16x9"] as const) {
      const call = (h.generate.mock.calls as unknown as [{ refs: string[]; aspect: string; prompt: string }][]).find(([o]) => o.aspect === PRESETS_ASPECT[k])![0];
      expect(call.refs).toEqual([SCENE, PRODUCT]);
      expect(call.prompt).toContain("Redraw that SAME scene at this picture's aspect ratio");
      const a = areaOf[k], pc = (v: number) => `${Math.round(v * 100)}%`;
      expect(call.prompt).toContain(`x ${pc(a.x0)}-${pc(a.x1)}`);
      expect(variantOf(h.state(), k)).toMatchObject({ bgImageHasProduct: true, bgProductArea: a });
    }
  });
});

describe("R4-D 兩個入口共用一套流程", () => {
  it("AI 一鍵設計 and 畫面「AI 合成進場景」 get the ONE flow instance the page holds; no own scene drawing is left", () => {
    const read = (f: string) => readFileSync(join(__dirname, f), "utf8");
    const page = read("BannerStudio.tsx");
    expect(page.match(/useSceneFlow\(/g)).toHaveLength(1);
    expect(page).toMatch(/<StepAi [^>]*flow=\{sceneFlow\}/);
    expect(page).toMatch(/<StepCanvas [^>]*flow=\{sceneFlow\}/);
    for (const f of ["steps/StepAi.tsx", "steps/StepCanvas.tsx"]) {
      const src = read(f);
      expect(src).toContain("flow: SceneFlowHandle");
      expect(src).toContain("<ScenePicker ");
      expect(src).not.toMatch(/useSceneFlow\(|compositeSizes|compositePrompt|drawnAreas/);
    }
  });
});

describe("R4-D 付費生成中點縮圖不作廢已付費的圖", () => {
  it("a pick while the other sizes are drawing is refused; the paid pictures still land", async () => {
    const h = harness(design);
    await h.flow.pick(0, cell);
    const waiting: (() => void)[] = [];
    h.generate.mockImplementation(() => new Promise<string>((r) => { waiting.push(() => r(SCENE)); }));
    const release = () => waiting.splice(0).forEach((f) => f());
    const run = h.flow.drawOthers(cell, src, "extend");
    await new Promise((r) => setTimeout(r, 0));
    expect(h.state().generating).toBe(true);
    expect(await h.flow.pick(1, { ...cell, image: "data:image/png;base64,OTHER" })).toBe(false);
    release(); await new Promise((r) => setTimeout(r, 0)); release();
    await run;
    expect(h.state()).toMatchObject({ bgImage: SCENE, generating: false });
    expect(variantOf(h.state(), "r9x16").bgProductArea).toEqual(areaOf.r9x16);
  });
});

describe("R4-D Codex F1 換商品後不付費畫舊商品", () => {
  it("after 換圖 the picked cell offers no other sizes and the button spends nothing", async () => {
    const h = harness(design);
    await h.flow.pick(0, cell);
    expect(otherSizesOf(h.state(), cell)).toEqual(["r9x16", "r16x9"]);
    const swapped: State = { ...h.state(), productImage: "data:image/png;base64,NEWPRODUCT" };
    expect(otherSizesOf(swapped, cell)).toEqual([]);
    const h2 = harness(swapped);
    await h2.flow.drawOthers(cell, src, "extend");
    expect(h2.generate).not.toHaveBeenCalled();
  });
});

describe("R4-D Codex F2 付費中取消的尺寸不寫入", () => {
  it("a size dropped while the other sizes draw gets no picture and is named as billed, not applied", async () => {
    const h = harness(design);
    await h.flow.pick(0, cell);
    const waiting: (() => void)[] = [];
    h.generate.mockImplementation(() => new Promise<string>((r) => { waiting.push(() => r(SCENE)); }));
    const release = () => waiting.splice(0).forEach((f) => f());
    const run = h.flow.drawOthers(cell, src, "extend");
    await new Promise((r) => setTimeout(r, 0));
    // StepSize disables the size buttons while generating; the flow must still hold if the picked sizes change
    const dropped = toggleSizePick(h.state(), "r9x16");
    Object.assign(h.state(), dropped);
    release(); await new Promise((r) => setTimeout(r, 0)); release();
    await run;
    expect(h.state().multiSizes).toEqual(["r16x9"]);
    expect(h.state().sizeOverrides.r9x16?.bgImage).toBeUndefined();
    expect(h.view().sizeJobs.r9x16).toMatch(/^這個尺寸已取消，這張沒有套用（已計費/);
    expect(variantOf(h.state(), "r16x9").bgProductArea).toEqual(areaOf.r16x9);
  });
});

describe("R4-D Codex 複審 付費進行中不能再付費", () => {
  it("while the paid pictures are still being contrast-checked, a second paid click and a new candidate draw are refused", async () => {
    let st: State = design, view: FlowView = EMPTY_VIEW, checking: (() => void) | null = null, checks = 0;
    const generate = vi.fn(async () => SCENE);
    const flow = sceneFlow({
      current: () => st, apply: (fn) => { st = fn(st); }, view: (fn) => { view = fn(view); }, generate, areas,
      check: () => { checks++; return checks === 1 ? Promise.resolve({ patch: {}, unmet: [] } as never)
        : new Promise((r) => { checking = () => r({ patch: {}, unmet: [] } as never); }); },
    });
    await flow.pick(0, cell);
    const run = flow.drawOthers(cell, src, "extend");
    for (let i = 0; i < 20 && !checking; i++) await new Promise((r) => setTimeout(r, 0));
    expect(checking).not.toBeNull();               // pictures drawn, contrast check pending
    expect(generate).toHaveBeenCalledTimes(2);
    expect(st.generating).toBe(true);
    expect(await flow.drawOthers(cell, src, "extend")).toBe(false);
    expect(await flow.draw(st, 2, src)).toBe(false);
    expect(generate).toHaveBeenCalledTimes(2);     // nothing paid twice
    checking!(); expect(await run).toBe(true);
    expect(st.generating).toBe(false);
    expect(variantOf(st, "r9x16").bgProductArea).toEqual(areaOf.r9x16);
    expect(view.sizeJobs).toEqual({});
  });
});

describe("R4-D Codex 第三、四輪 AI 一鍵設計與付費場景互斥", () => {
  const rig = () => {
    let st: State = design, view: FlowView = EMPTY_VIEW, checking: (() => void) | null = null, checks = 0;
    const generate = vi.fn(async () => SCENE);
    const flow = sceneFlow({
      current: () => st, apply: (fn) => { st = fn(st); }, view: (fn) => { view = fn(view); }, generate, areas,
      check: () => { checks++; return checks === 1 ? Promise.resolve({ patch: {}, unmet: [] } as never)
        : new Promise((r) => { checking = () => r({ patch: {}, unmet: [] } as never); }); },
    });
    return { flow, generate, st: () => st, view: () => view, release: () => checking?.(), checking: () => checking };
  };
  it("AI 一鍵設計 pressed while paid other sizes are being checked is refused; the paid sizes still land", async () => {
    const h = rig();
    await h.flow.pick(0, cell);
    const run = h.flow.drawOthers(cell, src, "extend");
    for (let i = 0; i < 20 && !h.checking(); i++) await new Promise((r) => setTimeout(r, 0));
    const job = vi.fn(async () => {});
    expect(await h.flow.hold(job)).toBe(false);
    expect(job).not.toHaveBeenCalled();             // the design call is never sent
    h.release(); expect(await run).toBe(true);
    expect(variantOf(h.st(), "r9x16").bgProductArea).toEqual(areaOf.r9x16);
    expect(h.view().picked).toBe(0);
  });
  it("while AI 一鍵設計's design call runs, 合成進場景 is refused; the design's own scenes are drawn", async () => {
    const h = rig();
    let answer: (() => void) | null = null;
    const design1 = h.flow.hold(async (drawHere) => {
      await new Promise<void>((r) => { answer = r; });   // the paid design call
      await drawHere(h.st(), 2, src);
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(h.st().generating).toBe(true);
    expect(await h.flow.draw(h.st(), 3, src)).toBe(false);
    answer!(); expect(await design1).toBe(true);
    expect(h.generate).toHaveBeenCalledTimes(2);
    expect(h.view().cells.map((c) => c.state)).toEqual(["ok", "ok"]);
    expect(h.st().generating).toBe(false);
    const ai = readFileSync(join(__dirname, "steps/StepAi.tsx"), "utf8");
    expect(ai).toContain("await flow.hold(async (drawHere) => {");
    expect(ai).toContain("await drawHere(applied, scenesWanted, {");
    expect(ai).not.toMatch(/flow\.(draw|reset)\(/);
  });
});

describe("R4-D Codex 第五輪 復原不解開付費鎖", () => {
  it("undo / redo bring the design back but keep what is in flight now (generating stays on during a paid run)", () => {
    const before: State = { ...design, headline: "舊標題", generating: false, designing: false };
    const now: State = { ...design, headline: "新標題", generating: true, designing: true, saving: true };
    const back = restoreSnapshot(before, now);
    expect(back.headline).toBe("舊標題");
    for (const k of IN_FLIGHT) expect(back[k]).toEqual(now[k]);
    const page = readFileSync(join(__dirname, "BannerStudio.tsx"), "utf8");
    expect(page.match(/setS\(\(prev\) => restoreSnapshot\(snap, prev\)\)/g)).toHaveLength(2);
    expect(page).not.toMatch(/setS\(historyRef\.current\[/);
  });
});
