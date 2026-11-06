// R0-PLAN §6 C4.3：三個面板 blocks/{ai-fill,genfx,edge-mask}.js（照舊編輯器 CanvasEditor.tsx:2596-2721 原樣搬）＋ blocks/ai-edit.js（AI 修圖）。
// 每個面板對 mock ctx 一條主要流程：按主要按鈕 → 呼叫了對的 ctx 方法與 API，參數形狀對；新檔零色碼；模組能解析載入。
// 載入法同 vector-pro-dock.test.ts：esbuild 打包（/editor-shared/… 對到 public/）再 data: URL import；DOM 用 jsdom（手動掛，
// 因為 esbuild 在 vitest jsdom 環境會撞 TextEncoder 不變量）。瀏覽器專屬的解碼／canvas 以最小替身代替（只回固定像素與 data URL）。
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const APP = path.resolve(__dirname, "..", "..", "..");
const PUBLIC = path.join(APP, "public");
const read = (rel: string) => fs.readFileSync(path.join(APP, rel), "utf8");
const BLOCKS = ["ai-fill", "genfx", "edge-mask", "ai-edit"].map((id) => `public/editor-shared/blocks/${id}.js`);
const NEW_FILES = [...BLOCKS, "public/editor-shared/edge-mask.js", "public/editor-shared/outpaint-presets.js", "public/editor-shared/posterize.js"];
const OUT_PNG = "data:image/png;base64,T1VU"; // "OUT"
const CANVAS_PNG = "data:image/png;base64,Q1ZT"; // "CVS"

async function loadModule(rel: string) {
  const out = await build({
    entryPoints: [path.join(APP, rel)], bundle: true, format: "esm", platform: "neutral", write: false, logLevel: "silent",
    plugins: [{ name: "site-root", setup(b) { b.onResolve({ filter: /^\/editor-shared\// }, (a) => ({ path: path.join(PUBLIC, a.path) })); } }],
  });
  return import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
}

// ---- DOM + browser-only stand-ins ----
const g = globalThis as any;
const saved: Record<string, unknown> = {};
let dom: JSDOM;
let fetchMock: ReturnType<typeof vi.fn>;
let maskPixels: number[] = [255, 255, 255, 255]; // RGBA the mask canvas reads back (repeated)
let imageSrcs: string[] = []; // every Image.src the panels decode
let draws: { op: string; args: number[] }[] = []; // every drawImage: composite mode at the time + x,y,w,h
let bitmapSizes: { width: number; height: number }[] = []; // sizes createImageBitmap hands out in order (then 4×2)
let bitmapBlobs: Blob[] = []; // every Blob decoded
beforeAll(() => {
  dom = new JSDOM("<!doctype html><body></body>");
  const w = dom.window as any;
  for (const k of ["document", "window", "Image", "createImageBitmap", "fetch"]) saved[k] = g[k];
  g.document = w.document;
  g.window = w;
  g.createImageBitmap = async (b: Blob) => { bitmapBlobs.push(b); return bitmapSizes.shift() ?? { width: 4, height: 2 }; };
  g.Image = class { onload: (() => void) | null = null; onerror: (() => void) | null = null; naturalWidth = 4; naturalHeight = 2; width = 4; height = 2; crossOrigin = "";
    set src(v: string) { imageSrcs.push(v); setTimeout(() => this.onload?.(), 0); } };
  w.HTMLCanvasElement.prototype.getContext = function () {
    return { drawImage(...a: unknown[]) { draws.push({ op: this.globalCompositeOperation, args: a.slice(1) as number[] }); }, putImageData() {}, clearRect() {}, globalCompositeOperation: "source-over",
      getImageData: (_x: number, _y: number, cw: number, ch: number) => ({ data: Uint8ClampedArray.from({ length: cw * ch * 4 }, (_, i) => maskPixels[i % maskPixels.length]) }) };
  };
  w.HTMLCanvasElement.prototype.toDataURL = () => CANVAS_PNG;
});
afterAll(() => { for (const [k, v] of Object.entries(saved)) g[k] = v; dom.window.close(); });
beforeEach(() => {
  maskPixels = [255, 255, 255, 255];
  imageSrcs = [];
  draws = [];
  bitmapSizes = [];
  bitmapBlobs = [];
  fetchMock = vi.fn(async () => ({ status: 200, json: async () => ({ ok: true, image: OUT_PNG }) }));
  g.fetch = fetchMock;
});

function mockCtx(extra: Record<string, unknown> = {}) {
  return {
    selectedImage: vi.fn(async () => ({ id: "L1", blob: new Blob([Uint8Array.from([1, 2, 3])], { type: "image/png" }), width: 4, height: 2, transform: [1, 0, 0, 1, 0, 0] })),
    selectionMask: vi.fn(async () => new Blob([Uint8Array.from([9])], { type: "image/png" })),
    replaceImage: vi.fn(async (_id: string, _blob: Blob) => ({ id: "L2" })),
    placeImage: vi.fn(async (_blob: Blob, _name?: string) => ({ ids: ["L3"] })),
    info: vi.fn(), busy: vi.fn(),
    ...extra,
  };
}
async function mount(rel: string, ctx: ReturnType<typeof mockCtx>) {
  const body = document.createElement("div");
  document.body.appendChild(body);
  (await loadModule(rel)).default.mount(ctx, body);
  return body;
}
const q = (body: HTMLElement, sel: string) => body.querySelector(sel) as HTMLElement & { value: string; click(): void };
const blobText = async (b: Blob) => Buffer.from(await b.arrayBuffer()).toString();
const sentBody = (i = 0) => JSON.parse((fetchMock.mock.calls[i] as unknown as [string, RequestInit])[1].body as string);
const sentInit = (i = 0) => (fetchMock.mock.calls[i] as unknown as [string, RequestInit])[1];

describe("ai-fill：去除／生成填色", () => {
  it("去除：選取圖片＋選取範圍 → POST /inpaint { image, mask }（帶角色標頭）→ replaceImage(同 id, 結果 PNG)", async () => {
    const ctx = mockCtx();
    const body = await mount(BLOCKS[0], ctx);
    q(body, "[data-af-mode=remove]").click();
    q(body, "[data-af-apply]").click();
    await vi.waitFor(() => expect(ctx.replaceImage).toHaveBeenCalled());
    expect(ctx.selectionMask).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/tools/studio/inpaint");
    expect(sentInit().method).toBe("POST");
    expect(sentInit().headers).toEqual({ "Content-Type": "application/json", "x-ops-simulated-role": "operator" });
    expect(sentBody()).toEqual({ image: CANVAS_PNG, mask: CANVAS_PNG });
    const [id, blob] = ctx.replaceImage.mock.calls[0] as unknown as [string, Blob];
    expect(id).toBe("L1");
    expect(blob.type).toBe("image/png");
    // not the raw AI image: keepOutsideMask decoded source, AI result and mask, and re-encoded the merge
    expect(await blobText(blob)).toBe("CVS");
    expect(await Promise.all(bitmapBlobs.map(blobText))).toEqual(expect.arrayContaining(["\u0001\u0002\u0003", "OUT", "\t"]));
  });
  it("mergeMasked：遮罩內取 AI 像素，遮罩外原圖像素（含透明）一個不變", async () => {
    const { mergeMasked } = await loadModule(BLOCKS[0]);
    const orig = Uint8ClampedArray.from([10, 20, 30, 255, 0, 0, 0, 0, 1, 2, 3, 128, 40, 50, 60, 255]);
    const ai = Uint8ClampedArray.from([250, 120, 0, 255, 250, 120, 0, 255, 250, 120, 0, 255, 250, 120, 0, 255]);
    // 3rd pixel selected; 4th white but 25% alpha (below the 50% rule) = not selected
    const mask = Uint8ClampedArray.from([0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 64]);
    expect([...mergeMasked(orig, ai, mask)]).toEqual([10, 20, 30, 255, 0, 0, 0, 0, 250, 120, 0, 255, 40, 50, 60, 255]);
  });
  it("生成填色：要 prompt；POST /genfill { image, mask, prompt }", async () => {
    const ctx = mockCtx();
    const body = await mount(BLOCKS[0], ctx);
    q(body, "[data-af-mode=fill]").click();
    q(body, "[data-af-apply]").click();
    await vi.waitFor(() => expect(q(body, "[data-af-msg]").textContent).toContain("prompt"));
    expect(fetchMock).not.toHaveBeenCalled();
    q(body, "[data-af-prompt]").value = "一片藍天";
    q(body, "[data-af-apply]").click();
    await vi.waitFor(() => expect(ctx.replaceImage).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/tools/studio/genfill");
    expect(sentBody()).toEqual({ image: CANVAS_PNG, mask: CANVAS_PNG, prompt: "一片藍天" });
  });
  it("連按兩次只送一次付費請求；selectionMask 拒絕 → 面板顯示錯誤、解除忙碌", async () => {
    const ctx = mockCtx();
    const body = await mount(BLOCKS[0], ctx);
    q(body, "[data-af-mode=remove]").click();
    q(body, "[data-af-apply]").click();
    q(body, "[data-af-apply]").click();
    await vi.waitFor(() => expect(ctx.replaceImage).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const bad = mockCtx({ selectionMask: vi.fn(async () => { throw new Error("host_failed"); }) });
    const b2 = await mount(BLOCKS[0], bad);
    q(b2, "[data-af-mode=remove]").click();
    q(b2, "[data-af-apply]").click();
    await vi.waitFor(() => expect(q(b2, "[data-af-msg]").textContent).toContain("host_failed"));
    expect(bad.busy).toHaveBeenLastCalledWith(false);
  });
  it("沒有選取範圍（null 或全黑）→ 不呼叫 API；宿主沒有 selectionMask → 模式鈕停用", async () => {
    const ctx = mockCtx({ selectionMask: vi.fn(async () => null) });
    const body = await mount(BLOCKS[0], ctx);
    q(body, "[data-af-mode=remove]").click();
    q(body, "[data-af-apply]").click();
    await vi.waitFor(() => expect(q(body, "[data-af-msg]").textContent).toContain("選取工具"));
    maskPixels = [0, 0, 0, 255];
    const ctx2 = mockCtx();
    const body2 = await mount(BLOCKS[0], ctx2);
    q(body2, "[data-af-mode=remove]").click();
    q(body2, "[data-af-apply]").click();
    await vi.waitFor(() => expect(q(body2, "[data-af-msg]").textContent).toContain("空的"));
    expect(fetchMock).not.toHaveBeenCalled();
    const { selectionMask: _drop, ...noMask } = mockCtx();
    const body3 = await mount(BLOCKS[0], noMask as ReturnType<typeof mockCtx>);
    expect((q(body3, "[data-af-mode=remove]") as unknown as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("genfx：擴圖／色調分離", () => {
  it("outpaintFrame：每個方向原圖在擴大畫布中的位置（原圖像素單位）", async () => {
    const { outpaintFrame } = await loadModule(BLOCKS[1]);
    expect(outpaintFrame("Zoom out 1.5x", 100, 80)).toEqual({ W: 150, H: 120, x: 25, y: 20 });
    expect(outpaintFrame("Zoom out 2x", 100, 80)).toEqual({ W: 200, H: 160, x: 50, y: 40 });
    expect(outpaintFrame("Make square", 100, 80)).toEqual({ W: 100, H: 100, x: 0, y: 10 });
    expect(outpaintFrame("Left outpaint", 100, 80)).toEqual({ W: 200, H: 80, x: 100, y: 0 });
    expect(outpaintFrame("Right outpaint", 100, 80)).toEqual({ W: 200, H: 80, x: 0, y: 0 });
    expect(outpaintFrame("Top outpaint", 100, 80)).toEqual({ W: 100, H: 160, x: 0, y: 80 });
    expect(outpaintFrame("Bottom outpaint", 100, 80)).toEqual({ W: 100, H: 160, x: 0, y: 0 });
  });
  it("meanDiff：只比原圖不透明的像素；完全相同 0、整片差 100 → 100", async () => {
    const { meanDiff, MATCH_MAX_DIFF } = await loadModule(BLOCKS[1]);
    const src = Uint8ClampedArray.from([10, 20, 30, 255, 99, 99, 99, 0]);
    expect(meanDiff(Uint8ClampedArray.from([10, 20, 30, 255, 0, 0, 0, 255]), src)).toBe(0); // 2nd pixel transparent in src: ignored
    expect(meanDiff(Uint8ClampedArray.from([110, 120, 130, 255, 0, 0, 0, 0]), src)).toBe(100);
    expect(MATCH_MAX_DIFF).toBeLessThan(100);
  });
  it("擴圖對齊：結果縮回原圖比例（908×789＋向左 → 1440×625 → 1816×789），原圖像素貼回 (908,0)，新圖層左上＝原圖左上 − (908,0)", async () => {
    const ctx = mockCtx();
    const sel = await ctx.selectedImage();
    ctx.selectedImage = vi.fn(async () => ({ ...sel, transform: [1, 0, 0, 1, 300, 190] })) as never;
    const body = await mount(BLOCKS[1], ctx);
    bitmapSizes = [{ width: 908, height: 789 }, { width: 908, height: 789 }, { width: 1440, height: 625 }]; // uploadable, source, result
    q(body, "[data-gf-prompt]").value = "海邊草地";
    q(body, '#gfDirs button[data-v="Left outpaint"]').click();
    q(body, "[data-gf-outpaint]").click();
    await vi.waitFor(() => expect(ctx.placeImage).toHaveBeenCalled());
    // result at frame scale, then the source pasted back at (908,0)
    expect(draws.map((d) => d.args).filter((a) => a.length !== 8).slice(-2)).toEqual([[0, 0, 1816, 789], [908, 0]]); // 8 args = content-check thumbnails
    const [blob, name, opts] = ctx.placeImage.mock.calls[0] as unknown as [Blob, string, { at: number[] }];
    expect([await blobText(blob), name, opts]).toEqual(["CVS", "擴圖.png", { at: [300 - 908, 190] }]);
    expect(q(body, "[data-gf-msg]").textContent).toContain("✅");
  });
  it("擴圖：方向是看得到的按鈕（無 <select>）；POST /genfill { image, prompt, outpaint }；回傳形狀對不上 → 原樣 placeImage 並警告", async () => {
    const ctx = mockCtx();
    const body = await mount(BLOCKS[1], ctx);
    expect(body.querySelector("select")).toBeNull();
    const dirs = [...body.querySelectorAll("#gfDirs button")].map((b) => (b as HTMLElement).dataset.v);
    expect(dirs).toEqual(["Zoom out 1.5x", "Zoom out 2x", "Make square", "Left outpaint", "Right outpaint", "Top outpaint", "Bottom outpaint"]);
    q(body, "[data-gf-prompt]").value = "海邊草地";
    q(body, '#gfDirs button[data-v="Left outpaint"]').click();
    q(body, "[data-gf-outpaint]").click();
    await vi.waitFor(() => expect(ctx.placeImage).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/tools/studio/genfill");
    expect(sentBody()).toEqual({ image: CANVAS_PNG, prompt: "海邊草地", outpaint: "Left outpaint" });
    expect(await blobText((ctx.placeImage.mock.calls[0] as unknown as [Blob])[0])).toBe("OUT"); // 4×2 result vs 8×2 frame
    expect(q(body, "[data-gf-msg]").textContent).toContain("對不上");
    expect(ctx.replaceImage).not.toHaveBeenCalled();
  });
  it("色調分離：色階滑桿 2–16 → posterize → replaceImage(同 id)，不打 API", async () => {
    const ctx = mockCtx();
    const body = await mount(BLOCKS[1], ctx);
    const lv = q(body, "[data-gf-levels]");
    expect([lv.getAttribute("min"), lv.getAttribute("max"), lv.value]).toEqual(["2", "16", "5"]);
    q(body, "[data-gf-posterize]").click();
    await vi.waitFor(() => expect(ctx.replaceImage).toHaveBeenCalled());
    const [id, blob] = ctx.replaceImage.mock.calls[0] as unknown as [string, Blob];
    expect(id).toBe("L1");
    expect(await blobText(blob)).toBe("CVS");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("edge-mask：邊緣遮罩", () => {
  it("每種筆刷一顆看得到的鈕；按下 → replaceImage(同 id)；換筆刷從第一次前的原圖重做", async () => {
    const { EDGE_MASK_STYLES } = await loadModule("public/editor-shared/edge-mask.js");
    const ctx = mockCtx();
    let sel = { id: "L1", blob: new Blob(["A"], { type: "image/png" }) };
    ctx.selectedImage = vi.fn(async () => sel) as never;
    const body = await mount(BLOCKS[2], ctx);
    const chips = [...body.querySelectorAll("[data-em-style]")].map((b) => (b as HTMLElement).dataset.emStyle);
    expect(chips).toEqual(EDGE_MASK_STYLES.map((s: { id: string }) => s.id));
    q(body, '[data-em-style="dry-brush"]').click();
    await vi.waitFor(() => expect(ctx.replaceImage).toHaveBeenCalledTimes(1));
    expect(ctx.replaceImage.mock.calls[0][0]).toBe("L1");
    expect(q(body, '[data-em-style="dry-brush"]').classList.contains("tab--active")).toBe(true);
    sel = { id: "L2", blob: new Blob(["MASKED"], { type: "image/png" }) }; // host now selects the replaced layer
    q(body, '[data-em-style="mask-03"]').click();
    await vi.waitFor(() => expect(ctx.replaceImage).toHaveBeenCalledTimes(2));
    expect(ctx.replaceImage.mock.calls[1][0]).toBe("L2");
    const A = "data:image/png;base64," + Buffer.from("A").toString("base64");
    expect(imageSrcs.filter((s) => s === A)).toHaveLength(2); // both edges cut from the untouched source
    expect(imageSrcs.some((s) => s.includes(Buffer.from("MASKED").toString("base64")))).toBe(false);
    expect(imageSrcs).toContain("/edge-masks/mask-03.png");
    // compositing (applyEdgeMask, CE:1535): source drawn normally, then the mask with destination-in; procedural mask covers the
    // whole 4×2 image, an asset mask is inset by amount 55 → scale 1 − 0.55·0.28 = 0.846 (strokes never clipped by the edge)
    expect(draws.map((d) => d.op)).toEqual(["source-over", "destination-in", "source-over", "destination-in"]);
    expect(draws[1].args).toEqual([0, 0, 4, 2]);
    const [mx, my, mw, mh] = draws[3].args;
    expect([mx, my, mw, mh].map((n) => +n.toFixed(3))).toEqual([0.308, 0.154, 3.384, 1.692]);
    expect(q(body, '[data-em-style="mask-03"]').classList.contains("tab--active")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ai-edit：AI 修圖", () => {
  it("ai-edit 模型與價錢＝STUDIO_MODEL_OPTIONS；每個都吃參考圖；比例規則＝nearestAspectRatio", async () => {
    const { AI_EDIT_MODELS, nearestAspectRatio } = await loadModule(BLOCKS[3]);
    const { STUDIO_MODEL_OPTIONS, nearestAspectRatio: ref, PRODUCT_COMPOSITE_MODELS } = await import("../model-options");
    for (const m of AI_EDIT_MODELS as { value: string; label: string; costNt: number }[]) {
      const s = STUDIO_MODEL_OPTIONS.find((o) => o.value === m.value);
      expect(s, m.value).toBeDefined();
      expect({ label: m.label, costNt: m.costNt }).toEqual({ label: s!.label, costNt: s!.costNt });
      expect(s!.maxRefs).toBeGreaterThan(0);
      expect(PRODUCT_COMPOSITE_MODELS).toContain(m.value);
    }
    for (const [w, h] of [[908, 789], [1000, 1000], [1920, 1080], [600, 900], [1200, 1500], [4, 2], [3, 10]]) expect(nearestAspectRatio(w, h)).toBe(ref(w, h));
  });
  it("每個模型一顆看得到的鈕並標價；按下 → POST /generate { model, prompt, referenceImages:[圖], aspectRatio } → placeImage，原圖不動", async () => {
    const ctx = mockCtx();
    const body = await mount(BLOCKS[3], ctx);
    const btns = [...body.querySelectorAll("[data-ae-model]")] as HTMLButtonElement[];
    expect(btns.map((b) => b.dataset.aeModel)).toEqual(["openai-25-edit", "nano-banana-2", "nano-banana-pro", "flux-kontext-pro"]);
    for (const b of btns) expect(b.textContent).toMatch(/NT\$\d/);
    q(body, "[data-ae-prompt]").value = "海邊";
    btns[0].click();
    await vi.waitFor(() => expect(q(body, "[data-ae-msg]").textContent).toContain("3 個字"));
    expect(fetchMock).not.toHaveBeenCalled();
    q(body, "[data-ae-prompt]").value = "把背景換成海邊";
    btns[1].click();
    btns[1].click();
    await vi.waitFor(() => expect(ctx.placeImage).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/tools/studio/generate");
    expect(sentInit().headers).toEqual({ "Content-Type": "application/json", "x-ops-simulated-role": "operator" });
    expect(sentBody()).toEqual({ model: "nano-banana-2", prompt: "把背景換成海邊", referenceImages: [CANVAS_PNG], aspectRatio: "16:9" });
    expect(ctx.replaceImage).not.toHaveBeenCalled();
    expect((ctx.placeImage.mock.calls[0] as unknown[]).slice(1)).toEqual(["AI 修圖.png", { at: [0, 0] }]); // source's top-left
    expect(q(body, "[data-ae-msg]").textContent).toContain("NT$2.2");
  });
  it("API 失敗 → 顯示錯誤、不置入、解除忙碌", async () => {
    fetchMock.mockImplementation(async () => ({ status: 200, json: async () => ({ ok: false, error: "點數不足" }) }));
    const ctx = mockCtx();
    const body = await mount(BLOCKS[3], ctx);
    q(body, "[data-ae-prompt]").value = "把背景換成海邊";
    q(body, '[data-ae-model="openai-25-edit"]').click();
    await vi.waitFor(() => expect(q(body, "[data-ae-msg]").textContent).toContain("點數不足"));
    expect(ctx.placeImage).not.toHaveBeenCalled();
    expect(ctx.busy).toHaveBeenLastCalledWith(false);
  });
});

describe("新檔：零色碼、用 app 統一 class、只用主題 token", () => {
  const ROOT_TOKENS = (() => {
    const css = read("app/globals.css");
    const root = css.slice(css.indexOf(":root {"), css.indexOf("\n}", css.indexOf(":root {")));
    return new Set([...root.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  })();
  it.each(BLOCKS)("%s", (rel) => {
    const src = read(rel).replace(/\/\/.*$/gm, "");
    expect(src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], rel).toEqual([]);
    expect(src, rel).not.toMatch(/\b(?:rgba?|hsla?)\(/);
    expect([...src.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]).filter((v) => !ROOT_TOKENS.has(v)), rel).toEqual([]);
    expect(src, rel).not.toMatch(/<select/);
    const classes = [...src.matchAll(/class(?:Name)?\s*[=:]\s*\\?["'`]([^"'`\\]*)/g)].flatMap((m) => m[1].split(/\s+/));
    expect(classes.filter((c) => c === "act" || c === "ghost"), rel).toEqual([]);
  });
});

describe("模組都能解析載入", () => {
  it.each(NEW_FILES)("%s", async (rel) => {
    const mod = await loadModule(rel);
    expect(Object.keys(mod).length).toBeGreaterThan(0);
    if (rel.includes("/blocks/")) {
      expect(mod.default.id).toBe(path.basename(rel, ".js"));
      expect(typeof mod.default.title).toBe("string");
      expect(typeof mod.default.icon).toBe("string");
      expect(typeof mod.default.mount).toBe("function");
    }
  });
});
