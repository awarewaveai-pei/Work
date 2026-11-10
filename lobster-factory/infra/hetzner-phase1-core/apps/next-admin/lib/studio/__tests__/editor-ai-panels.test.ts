// R0-PLAN §6 C4.3：三個面板 blocks/{ai-fill,genfx,edge-mask}.js（照舊編輯器 CanvasEditor.tsx:2596-2721 原樣搬）＋ blocks/ai-edit.js（AI 修圖）。
// 2026-11-09：模型與價格全部來自 /editor-shared/image-models.js（面板不再手抄）；ai-fill 只送選取範圍周圍的裁切、羽化貼回、prompt 可空。
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
const NEW_FILES = [...BLOCKS, "public/editor-shared/edge-mask.js", "public/editor-shared/outpaint-presets.js", "public/editor-shared/posterize.js", "public/editor-shared/image-models.js"];
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
const priced = (b: Element) => expect(b.textContent).toMatch(/NT\$\d/);
// Every model button carries the catalog's own 特色 line under the price (operator 2026-11-09: 「每個按鈕的特色功能」).
const noted = (b: Element, rows: { value: string; note?: string }[]) => {
  const row = rows.find((m) => m.value === (b as HTMLElement).dataset.afModel || m.value === (b as HTMLElement).dataset.gfModel || m.value === (b as HTMLElement).dataset.aeModel);
  expect(row, (b as HTMLElement).textContent ?? "").toBeDefined();
  expect(row!.note, row!.value).toBeTruthy();
  expect(b.querySelector("small")?.textContent).toBe(row!.note);
};

describe("ai-fill：去除／生成填色", () => {
  it("去除：每個 remove 模型一顆標價的鈕；按下 → POST /inpaint { image, mask }（帶角色標頭）→ replaceImage(同 id, 貼回的 PNG)", async () => {
    const { EDIT_TOOLS } = await loadModule("public/editor-shared/image-models.js");
    const ctx = mockCtx();
    const body = await mount(BLOCKS[0], ctx);
    q(body, "[data-af-mode=remove]").click();
    const btns = [...body.querySelectorAll("[data-af-model]")];
    expect(btns.map((b) => (b as HTMLElement).dataset.afModel)).toEqual(EDIT_TOOLS.filter((t: { uses: string[] }) => t.uses.includes("remove")).map((t: { value: string }) => t.value));
    btns.forEach(priced);
    btns.forEach((b) => noted(b, EDIT_TOOLS));
    q(body, "[data-af-model=bria-eraser]").click();
    await vi.waitFor(() => expect(ctx.replaceImage).toHaveBeenCalled());
    expect(ctx.selectionMask).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/tools/studio/inpaint");
    expect(sentInit().method).toBe("POST");
    expect(sentInit().headers).toEqual({ "Content-Type": "application/json", "x-ops-simulated-role": "operator" });
    expect(sentBody()).toEqual({ image: CANVAS_PNG, mask: CANVAS_PNG });
    const [id, blob] = ctx.replaceImage.mock.calls[0] as unknown as [string, Blob];
    expect(id).toBe("L1");
    expect(blob.type).toBe("image/png");
    // not the raw AI image: fillSelection decoded source, mask and AI result, blended and re-encoded
    expect(await blobText(blob)).toBe("CVS");
    expect(await Promise.all(bitmapBlobs.map(blobText))).toEqual(expect.arrayContaining(["\u0001\u0002\u0003", "OUT", "\t"]));
    expect(q(body, "[data-af-msg]").textContent).toMatch(/✅.*Bria Eraser.*NT\$1\.28/); // 0.04 × 32, two decimals
  });
  it("生成填色：fill 模型 = 目錄 modelsFor('fill')（由便宜到貴）；prompt 可空；POST /genfill { image, mask, prompt, model }", async () => {
    const { modelsFor } = await loadModule("public/editor-shared/image-models.js");
    const ctx = mockCtx();
    const body = await mount(BLOCKS[0], ctx);
    q(body, "[data-af-mode=fill]").click();
    const btns = [...body.querySelectorAll("[data-af-model]")];
    expect(btns.map((b) => (b as HTMLElement).dataset.afModel)).toEqual(modelsFor("fill").map((m: { value: string }) => m.value));
    // Ideogram first: the only fill model that honours an empty prompt (prod 2026-11-09, image-models.js comment)
    // Cheapest first, one ordering rule for every panel and the guide (image-models.js modelsFor).
    expect(btns.map((b) => (b as HTMLElement).dataset.afModel)).toEqual(["flux-2-klein-4b", "flux-kontext-fast", "ideogram-4-5-edit-low", "flux-fill-pro", "ideogram-4-5-edit", "openai-26-edit"]);
    btns.forEach(priced);
    btns.forEach((b) => noted(b, modelsFor("fill")));
    q(body, "[data-af-model=ideogram-4-5-edit]").click();
    await vi.waitFor(() => expect(ctx.replaceImage).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/tools/studio/genfill");
    expect(sentBody()).toEqual({ image: CANVAS_PNG, mask: CANVAS_PNG, prompt: "", model: "ideogram-4-5-edit" });
    ctx.replaceImage.mockClear();
    q(body, "[data-af-mode=fill]").click();
    q(body, "[data-af-prompt]").value = "一片藍天";
    q(body, "[data-af-model=openai-26-edit]").click();
    await vi.waitFor(() => expect(ctx.replaceImage).toHaveBeenCalled());
    expect(sentBody(1)).toEqual({ image: CANVAS_PNG, mask: CANVAS_PNG, prompt: "一片藍天", model: "openai-26-edit" });
  });
  it("連按兩次只送一次付費請求；selectionMask 拒絕 → 面板顯示錯誤、解除忙碌", async () => {
    const ctx = mockCtx();
    const body = await mount(BLOCKS[0], ctx);
    q(body, "[data-af-mode=remove]").click();
    const b = q(body, "[data-af-model=bria-eraser]");
    b.click();
    b.click();
    await vi.waitFor(() => expect(ctx.replaceImage).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const bad = mockCtx({ selectionMask: vi.fn(async () => { throw new Error("host_failed"); }) });
    const b2 = await mount(BLOCKS[0], bad);
    q(b2, "[data-af-mode=remove]").click();
    q(b2, "[data-af-model=bria-eraser]").click();
    await vi.waitFor(() => expect(q(b2, "[data-af-msg]").textContent).toContain("host_failed"));
    expect(bad.busy).toHaveBeenLastCalledWith(false);
  });
  it("沒有選取範圍（null 或全黑）→ 不呼叫 API；宿主沒有 selectionMask → 模式鈕停用", async () => {
    const ctx = mockCtx({ selectionMask: vi.fn(async () => null) });
    const body = await mount(BLOCKS[0], ctx);
    q(body, "[data-af-mode=remove]").click();
    q(body, "[data-af-model=bria-eraser]").click();
    await vi.waitFor(() => expect(q(body, "[data-af-msg]").textContent).toContain("選取工具"));
    maskPixels = [0, 0, 0, 255];
    const ctx2 = mockCtx();
    const body2 = await mount(BLOCKS[0], ctx2);
    q(body2, "[data-af-mode=remove]").click();
    q(body2, "[data-af-model=bria-eraser]").click();
    await vi.waitFor(() => expect(q(body2, "[data-af-msg]").textContent).toContain("空的"));
    expect(fetchMock).not.toHaveBeenCalled();
    const { selectionMask: _drop, ...noMask } = mockCtx();
    const body3 = await mount(BLOCKS[0], noMask as ReturnType<typeof mockCtx>);
    expect((q(body3, "[data-af-mode=remove]") as unknown as HTMLButtonElement).disabled).toBe(true);
  });
  it("裁切：選取框 + 周圍 (50%，64–768 px) + 至少 512 邊，夾在圖內；小圖整張", async () => {
    const { maskBounds, cropRegion, CROP_PAD, CROP_MIN_SIDE } = await loadModule(BLOCKS[0]);
    expect([CROP_PAD.fraction, CROP_PAD.min, CROP_PAD.max, CROP_MIN_SIDE]).toEqual([0.5, 64, 768, 512]);
    const bytes = new Uint8Array(3000 * 2000);
    for (let y = 900; y < 1100; y++) bytes.fill(255, y * 3000 + 1400, y * 3000 + 1600); // 200×200 selection at (1400, 900)
    expect(maskBounds(bytes, 3000, 2000)).toEqual({ x: 1400, y: 900, w: 200, h: 200 });
    // pad = 100 (50% of 200 ≥ 64) → 400 wide → widened to 512: (1400−100−56, 900−100−56) 512×512
    expect(cropRegion({ x: 1400, y: 900, w: 200, h: 200 }, 3000, 2000)).toEqual({ x: 1244, y: 744, w: 512, h: 512 });
    expect(cropRegion({ x: 2900, y: 10, w: 80, h: 1800 }, 3000, 2000)).toEqual({ x: 2132, y: 0, w: 868, h: 2000 }); // pad 768, clamped right/top/bottom
    expect(cropRegion({ x: 1, y: 0, w: 2, h: 2 }, 4, 2)).toEqual({ x: 0, y: 0, w: 4, h: 2 });
    expect(maskBounds(new Uint8Array(8), 4, 2)).toBeNull();
  });
  it("羽化：模糊後的遮罩在選取邊兩側各留一段漸層，內 1 外 0；貼回 = 原圖·(1−a) + AI·a，含 alpha", async () => {
    const { featherAlpha, blendFeathered, FEATHER } = await loadModule(BLOCKS[0]);
    expect([FEATHER.fraction, FEATHER.min, FEATHER.max]).toEqual([0.015, 2, 12]);
    const w = 20, h = 1, bytes = new Uint8Array(w * h);
    bytes.fill(255, 10); // right half selected
    const a = featherAlpha(bytes, w, h, 2);
    expect(a[0]).toBe(0); expect(a[19]).toBe(1);
    expect(a[9]).toBeGreaterThan(0); expect(a[9]).toBeLessThan(0.5); // just outside the edge: AI fades in
    expect(a[10]).toBeGreaterThan(0.5); expect(a[10]).toBeLessThan(1); // just inside: source still shows
    for (let i = 1; i < w; i++) expect(a[i]).toBeGreaterThanOrEqual(a[i - 1]); // monotone ramp
    expect([...featherAlpha(bytes, w, h, 0)]).toEqual([...bytes].map((v) => v / 255)); // radius 0 = hard mask
    // premultiplied: over a TRANSPARENT source a half blend is the AI colour at half alpha, not a darkened colour
    const orig = Uint8ClampedArray.from([10, 20, 30, 255, 0, 0, 0, 0, 40, 60, 80, 255]);
    const ai = Uint8ClampedArray.from([250, 120, 0, 255, 250, 120, 0, 255, 240, 160, 0, 255]);
    expect([...blendFeathered(orig, ai, Float32Array.from([0, 0.5, 0.5]))]).toEqual([10, 20, 30, 255, 250, 120, 0, 128, 140, 110, 40, 255]);
  });
});

describe("genfx：擴圖／色調分離", () => {
  it("outpaintFrame：每個方向原圖在擴大畫布中的位置（原圖像素單位；SSOT outpaint-presets.js）", async () => {
    const { outpaintFrame } = await loadModule(BLOCKS[1]);
    expect(outpaintFrame("Zoom out 1.5x", 100, 80)).toEqual({ W: 150, H: 120, x: 25, y: 20 });
    expect(outpaintFrame("Zoom out 2x", 100, 80)).toEqual({ W: 200, H: 160, x: 50, y: 40 });
    expect(outpaintFrame("Make square", 100, 80)).toEqual({ W: 100, H: 100, x: 0, y: 10 });
    expect(outpaintFrame("Left outpaint", 100, 80)).toEqual({ W: 200, H: 80, x: 100, y: 0 });
    expect(outpaintFrame("Right outpaint", 100, 80)).toEqual({ W: 200, H: 80, x: 0, y: 0 });
    expect(outpaintFrame("Top outpaint", 100, 80)).toEqual({ W: 100, H: 160, x: 0, y: 80 });
    expect(outpaintFrame("Bottom outpaint", 100, 80)).toEqual({ W: 100, H: 160, x: 0, y: 0 });
    expect(outpaintFrame("nope", 100, 80)).toBeNull();
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
    q(body, "[data-gf-model=flux-fill-pro]").click();
    await vi.waitFor(() => expect(ctx.placeImage).toHaveBeenCalled());
    // result at frame scale, then the source pasted back at (908,0)
    expect(draws.map((d) => d.args).filter((a) => a.length !== 8).slice(-2)).toEqual([[0, 0, 1816, 789], [908, 0]]); // 8 args = content-check thumbnails
    const [blob, name, opts] = ctx.placeImage.mock.calls[0] as unknown as [Blob, string, { at: number[] }];
    expect([await blobText(blob), name, opts]).toEqual(["CVS", "擴圖.png", { at: [300 - 908, 190] }]);
    expect(q(body, "[data-gf-msg]").textContent).toMatch(/✅.*FLUX Fill Pro.*NT\$1\.6/);
  });
  it("擴圖：方向與模型都是看得到的按鈕（無 <select>）；模型 = modelsFor('outpaint')；POST /genfill { image, prompt, outpaint, model }；回傳形狀對不上 → 原樣 placeImage 並警告", async () => {
    const { modelsFor } = await loadModule("public/editor-shared/image-models.js");
    const ctx = mockCtx();
    const body = await mount(BLOCKS[1], ctx);
    expect(body.querySelector("select")).toBeNull();
    const dirs = [...body.querySelectorAll("#gfDirs button")].map((b) => (b as HTMLElement).dataset.v);
    expect(dirs).toEqual(["Zoom out 1.5x", "Zoom out 2x", "Make square", "Left outpaint", "Right outpaint", "Top outpaint", "Bottom outpaint"]);
    const models = [...body.querySelectorAll("[data-gf-model]")];
    expect(models.map((b) => (b as HTMLElement).dataset.gfModel)).toEqual(modelsFor("outpaint").map((m: { value: string }) => m.value));
    expect(models.map((b) => (b as HTMLElement).dataset.gfModel)).toEqual(["bria-expand", "flux-fill-pro"]);
    models.forEach(priced);
    models.forEach((b) => noted(b, modelsFor("outpaint")));
    q(body, "[data-gf-prompt]").value = "海邊草地";
    q(body, '#gfDirs button[data-v="Left outpaint"]').click();
    q(body, "[data-gf-model=bria-expand]").click();
    await vi.waitFor(() => expect(ctx.placeImage).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/tools/studio/genfill");
    expect(sentBody()).toEqual({ image: CANVAS_PNG, prompt: "海邊草地", outpaint: "Left outpaint", model: "bria-expand" });
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
  it("ai-edit 模型 = modelsFor('edit')；每個都在 STUDIO_MODEL_OPTIONS、吃參考圖；價錢 = nt(usd)；比例規則 = nearestAspectRatio", async () => {
    const { AI_EDIT_MODELS, nearestAspectRatio } = await loadModule(BLOCKS[3]);
    const { STUDIO_MODEL_OPTIONS, nearestAspectRatio: ref, PRODUCT_COMPOSITE_MODELS, nt } = await import("../model-options");
    expect((AI_EDIT_MODELS as { value: string }[]).map((m) => m.value)).toEqual(["flux-2-klein-4b", "flux-kontext-fast", "flux-kontext-pro", "nano-banana-2", "openai-25-edit", "openai-26-edit", "nano-banana-pro"]);
    for (const m of AI_EDIT_MODELS as { value: string; label: string; usd: number }[]) {
      const s = STUDIO_MODEL_OPTIONS.find((o) => o.value === m.value);
      expect(s, m.value).toBeDefined();
      expect({ label: m.label, costNt: nt(m.usd) }).toEqual({ label: s!.label, costNt: s!.costNt });
      expect(s!.maxRefs).toBeGreaterThan(0);
    }
    // 「整張改順」 models are not product compositors: never measured at placing a product photo (model-options.ts).
    expect(PRODUCT_COMPOSITE_MODELS).not.toContain("flux-2-klein-4b");
    expect(PRODUCT_COMPOSITE_MODELS).not.toContain("flux-kontext-fast");
    for (const [w, h] of [[908, 789], [1000, 1000], [1920, 1080], [600, 900], [1200, 1500], [4, 2], [3, 10]]) expect(nearestAspectRatio(w, h)).toBe(ref(w, h));
  });
  it("每個模型一顆看得到的鈕、標價並寫出特色；按下 → POST /generate { model, prompt, referenceImages:[圖], aspectRatio } → placeImage，原圖不動", async () => {
    const { AI_EDIT_MODELS } = await loadModule(BLOCKS[3]);
    const ctx = mockCtx();
    const body = await mount(BLOCKS[3], ctx);
    const btns = [...body.querySelectorAll("[data-ae-model]")] as HTMLButtonElement[];
    expect(btns.map((b) => b.dataset.aeModel)).toEqual(["flux-2-klein-4b", "flux-kontext-fast", "flux-kontext-pro", "nano-banana-2", "openai-25-edit", "openai-26-edit", "nano-banana-pro"]);
    btns.forEach(priced);
    btns.forEach((b) => noted(b, AI_EDIT_MODELS as { value: string; note?: string }[]));
    q(body, "[data-ae-prompt]").value = "海邊";
    btns[0].click();
    await vi.waitFor(() => expect(q(body, "[data-ae-msg]").textContent).toContain("3 個字"));
    expect(fetchMock).not.toHaveBeenCalled();
    q(body, "[data-ae-prompt]").value = "把背景換成海邊";
    // Click by model id, not by position: the button order follows the catalog's price sort and may move.
    const nano = btns.find((b) => b.dataset.aeModel === "nano-banana-2")!;
    nano.click();
    nano.click();
    await vi.waitFor(() => expect(ctx.placeImage).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/tools/studio/generate");
    expect(sentInit().headers).toEqual({ "Content-Type": "application/json", "x-ops-simulated-role": "operator" });
    expect(sentBody()).toEqual({ model: "nano-banana-2", prompt: "把背景換成海邊", referenceImages: [CANVAS_PNG], aspectRatio: "16:9" });
    expect(ctx.replaceImage).not.toHaveBeenCalled();
    expect((ctx.placeImage.mock.calls[0] as unknown[]).slice(1)).toEqual(["AI 修圖.png", { at: [0, 0] }]); // source's top-left
    const { IMAGE_MODELS, nt } = await loadModule("public/editor-shared/image-models.js");
    expect(q(body, "[data-ae-msg]").textContent).toContain("NT$" + nt(IMAGE_MODELS.find((m: { value: string }) => m.value === "nano-banana-2").usd)); // the catalog price
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

describe("模型目錄 image-models.js = 唯一的價格與模型來源", () => {
  it("TS 門（model-options、cost-model IMAGE_RATES）與瀏覽器讀同一份；面板檔沒有手抄的模型 id 或價錢", async () => {
    const { IMAGE_MODELS, EDIT_TOOLS, TWD_RATE, nt } = await loadModule("public/editor-shared/image-models.js");
    const { STUDIO_MODEL_OPTIONS, EDIT_TOOLS: TS_TOOLS, TWD_RATE: TS_RATE } = await import("../model-options");
    const { IMAGE_RATES, TWD_RATE: COST_RATE } = await import("../../ai/cost-model");
    expect(TS_RATE).toBe(TWD_RATE); expect(COST_RATE).toBe(TWD_RATE);
    expect(STUDIO_MODEL_OPTIONS.map((m) => [m.value, m.label, m.usd, m.costNt])).toEqual(IMAGE_MODELS.map((m: { value: string; label: string; usd: number }) => [m.value, m.label, m.usd, nt(m.usd)]));
    expect(TS_TOOLS).toEqual(EDIT_TOOLS);
    for (const m of [...IMAGE_MODELS, ...EDIT_TOOLS] as { value: string; usd: number; label: string; note?: string }[]) {
      expect(m.note, m.value + " needs a 特色 line").toBeTruthy();
      // 20 繁中 chars wrap to two short lines on the narrowest dock button and still read; beyond that the
      // button grows taller than the preview beside it (operator 2026-11-09 asked for clearer 特色 lines).
      expect(m.note!.length, m.value).toBeLessThanOrEqual(20);
      expect(IMAGE_RATES[m.value], m.value).toEqual(expect.objectContaining({ usd: m.usd, label: m.label }));
    }
    for (const rel of BLOCKS) {
      const src = read(rel).replace(/\/\/.*$/gm, "");
      expect(src.match(/costNt|"openai-2\d-edit"|"nano-banana|"flux-kontext|"bria-|"ideogram-/g) ?? [], rel).toEqual([]);
    }
    // the previous hand copies in TS are gone too
    for (const rel of ["lib/studio/model-options.ts", "lib/ai/cost-model.ts", "lib/studio/asset-group.ts", "app/(shell)/tools/ai-models/AiModelsClient.tsx",
      "app/(shell)/tools/tarot/TarotStudio.tsx", "lib/tarot/model-specs.ts", "lib/tarot/model-comparison.ts"]) {
      expect(read(rel), rel).not.toMatch(/= 32;|costNt: \d|"GPT-Image-1/);
    }
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
