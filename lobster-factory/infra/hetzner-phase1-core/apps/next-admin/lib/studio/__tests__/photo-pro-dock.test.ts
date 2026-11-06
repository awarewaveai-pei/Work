// 畫布（專業版）dock（R0-PLAN 2026-11-05-photocraft-pro §6 C4.4）：
// (1) photo-pro-dock/dock.js 面板清單與尺寸；(2) 面板呼叫的每個 ctx 方法都在 ctx-photocraft.js 與契約（選用項須有判斷）；
// (3) ctx-photocraft.js 對 mock window.photocraft＋postMessage，每個方法一條，參數照上游原始碼（實測序列見 ctx-contract.md）；
// (4) 新模組都能解析載入；(5) 新檔零色碼。
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPhotocraftCtx, fitQuad, scaleFor, toPixels, toQuality } from "../../../public/editor-shared/ctx-photocraft.js";

const APP = path.resolve(__dirname, "..", "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(APP, rel), "utf8");
const PANELS = ["templates", "color-grade", "bg-remove", "ai-fill", "genfx", "edge-mask", "webp", "my-designs", "qr", "barcode", "mockup", "batch-export"];
const OPTIONAL = ["importLegacy", "selectionMask", "fitLayer"]; // 契約「選用」：宿主沒有就不提供
const PUBLIC = path.join(APP, "public");

async function loadModule(rel: string) {
  const out = await build({
    entryPoints: [path.join(APP, rel)],
    bundle: true,
    format: "esm",
    platform: "neutral",
    write: false,
    logLevel: "silent",
    plugins: [{ name: "site-root", setup(b) { b.onResolve({ filter: /^\/(editor-shared|photo-pro-dock)\// }, (a) => ({ path: path.join(PUBLIC, a.path) })); } }],
  });
  return import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
}
const listOf = (src: string) => [...src.match(/export const PANEL_IDS = Object\.freeze\(\[([\s\S]*?)\]\)/)![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);

describe("photo-pro-dock/dock.js", () => {
  it("面板清單 = R0-PLAN C4 表（12 個，順序同）", () => {
    expect(listOf(read("public/photo-pro-dock/dock.js"))).toEqual(PANELS);
  });
  it("SIZES = PhotoCraft Pro 版型（dock.rs:37,73；panel_docking.rs:89-91,561；panel.rs:53），鍵 = 外殼 SIZE_VARS", async () => {
    const { SIZES } = await loadModule("public/photo-pro-dock/dock.js");
    const vars = [...read("public/editor-shared/dock.js").match(/export const SIZE_VARS = Object\.freeze\(\{([\s\S]*?)\}\)/)![1].matchAll(/(\w+):/g)].map((m) => m[1]);
    expect(Object.keys(SIZES).sort()).toEqual(vars.sort());
    expect(SIZES).toEqual({ rail: 36, button: 28, panel: 290, panelMin: 250, panelMax: 720, tab: 28, pad: 8 });
  });
});

// ---- 面板呼叫的 ctx 方法 ⊆ 轉接器 ∩ 契約；選用項面板要先判斷 ----
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const called = new Map<string, string[]>();
for (const id of PANELS) {
  for (const m of stripComments(read(`public/editor-shared/blocks/${id}.js`)).matchAll(/\bctx\.([A-Za-z_$][\w$]*)\s*\(/g)) {
    called.set(m[1], [...(called.get(m[1]) ?? []), id]);
  }
}
describe("面板用到的 ctx 都在 ctx-photocraft.js 與 ctx-contract.md", () => {
  const ctx = createPhotocraftCtx({ frame: () => undefined, timeoutMs: 1 }) as Record<string, unknown>;
  const contract = read("public/editor-shared/ctx-contract.md");
  it("掃描有效", () => expect(called.size).toBeGreaterThan(5));
  it.each([...called.keys()].sort())("ctx.%s", (name) => {
    expect(contract, `${name} 沒寫進 ctx-contract.md`).toContain(`\`${name}(`);
    if (OPTIONAL.includes(name)) {
      for (const id of called.get(name)!) expect(read(`public/editor-shared/blocks/${id}.js`), `${id} 呼叫選用的 ${name} 前沒判斷`).toContain(`typeof ctx.${name}`);
      return;
    }
    expect(typeof ctx[name], `${name} 被 ${called.get(name)!.join("、")} 呼叫，轉接器沒有`).toBe("function");
  });
  it("選用項：selectionMask、fitLayer 有；importLegacy 沒有（畫布不匯入舊專案，2026-11-06 定案）", () => {
    expect(typeof ctx.selectionMask).toBe("function");
    expect(typeof ctx.fitLayer).toBe("function");
    expect("importLegacy" in ctx).toBe(false);
  });
  it("host = 契約表的畫布列", () => {
    expect(ctx.host).toEqual({ id: "photocraft", label: "畫布", sourceExt: ".psd", sourceName: "design.psd", saveTag: { source: "canvas", modelName: "canvas", prompt: "canvas edit" }, listSources: ["canvas"] });
  });
});

// ---- mock：iframe 的 window.photocraft＋photocraft:open（postMessage）＋photocraft:save（message 事件） ----
type Call = [string, string, any];
const ORIGIN = "http://pc.test";
function mockPc(handlers: Record<string, (p: any, s: any) => any> = {}, opts: Record<string, any> = {}) {
  const listeners: ((e: any) => void)[] = [];
  (globalThis as any).window = { location: { origin: ORIGIN }, addEventListener: (t: string, f: any) => t === "message" && listeners.push(f) };
  const calls: Call[] = [];
  const state = {
    docs: [{ name: "base.png", width: 400, height: 300 }] as any[],
    active: 0,
    layers: [{ id: 2, name: "Layer 0", kind: "Pixel", bounds: [0, 0, 400, 300], active: false }, { id: 6, name: "green", kind: "Pixel", bounds: [40, 60, 120, 80], active: true }],
    hasSelection: false,
  };
  const cw: any = {};
  // synchronous, as a page host can be: a waiter registered after the trigger would miss it
  const emit = (data: any, from: { source?: any; origin?: string } = {}) => listeners.forEach((f) => f({ source: from.source ?? cw, origin: from.origin ?? ORIGIN, data }));
  const save = (name: string, text: string) => emit({ type: "photocraft:save", name, bytes: new TextEncoder().encode(text).buffer });
  const defaults: Record<string, (p: any) => any> = {
    "ui.inspect": () => ({ session: { documents: state.docs.map((d, index) => ({ ...d, index })), active: state.active } }),
    "document.inspect": () => ({ width: 400, height: 300, resolution: 72, hasSelection: state.hasSelection }),
    "layer.list": () => ({ layers: state.layers }),
    "layer.copyToDocument": (p) => (state.active = p.document, { document: p.document, layers: [99] }),
    "file.close": (p) => (state.docs.splice(p.document ?? state.active, 1), null),
    "document.activate": (p) => (state.active = p.document, { document: p.document }),
    "layer.duplicate": (p) => (state.docs.push({ name: p.documentName ?? "dup" }), state.active = state.docs.length - 1, { document: state.active, layers: [11] }),
    "image.duplicate": (p) => (state.docs.push({ name: p.name }), state.active = state.docs.length - 1, { document: state.active, name: p.name }),
    "ui.menu.invoke": (p) => {
      if (p.id === "file.export.quickExportAsPng") save("x.png", "PNG");
      if (p.id === "file.saveACopy") save("base copy.psd", "8BPS");
      return p.id === "file.export.exportAs" ? { dialog: 1 } : { fileDialog: "save" };
    },
    "ui.dialog.confirm": () => (save("base.webp", "RIFF"), { fileDialog: "save" }),
  };
  const run = async (kind: string, name: string, p: any) => {
    calls.push([kind, name, p]);
    const h = handlers[name] ?? defaults[name];
    return h ? h(p, state) : null;
  };
  cw.photocraft = { execute: (c: string, p: any) => run("execute", c, p), request: (m: string, p: any) => run("request", m, p) };
  cw.postMessage = (m: any, origin: string) => {
    calls.push(["post", m.type, { name: m.name, origin }]);
    opts.onOpen?.(state); // the user acting in the iframe while an op runs
    if (opts.openAtFront) { state.docs.unshift({ name: m.name }); state.active = 0; return; }
    state.docs.push({ name: m.name });
    state.active = state.docs.length - 1;
  };
  const downloads: [string, string][] = [];
  const ctx: any = createPhotocraftCtx({
    frame: () => ({ contentWindow: cw }) as unknown as HTMLIFrameElement,
    timeoutMs: 200,
    pollMs: 1,
    saveTimeoutMs: 100,
    download: async (b: Blob, n: string) => downloads.push([n, await b.text()]),
    ...opts.ctx,
  });
  return { ctx, calls, state, emit, save, downloads, cw };
}
const names = (calls: Call[]) => calls.filter((c) => c[1] !== "ui.inspect").map((c) => `${c[0]} ${c[1]}`);
afterEach(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).createImageBitmap;
});

describe("ctx-photocraft.js 契約（mock photocraft）", () => {
  it("placeSvg → 開暫用文件、copyToDocument 置中到原文件、關暫用文件", async () => {
    const { ctx, calls } = mockPc();
    expect(await ctx.placeSvg("<svg/>")).toEqual({ ids: [99] });
    expect(names(calls)).toEqual(["post photocraft:open", "execute layer.copyToDocument", "execute file.close", "execute document.activate"]);
    expect(calls.find((c) => c[1] === "photocraft:open")![2]).toMatchObject({ name: expect.stringMatching(/^awarewave-tmp-.+\.svg$/), origin: ORIGIN });
    expect(calls.find((c) => c[1] === "layer.copyToDocument")![2]).toEqual({ document: 0, center: true, name: "awarewave" });
    expect(calls.find((c) => c[1] === "file.close")![2]).toEqual({ document: 1, save: "discard" });
  });

  it("placeImage：沒有文件 → 這張圖就是文件；名稱跟 MIME", async () => {
    const { ctx, calls, state } = mockPc();
    state.docs = [];
    state.layers = [{ id: 1, name: "Layer 0", kind: "Pixel", bounds: [0, 0, 1, 1], active: true }];
    expect(await ctx.placeImage(new Blob(["x"], { type: "image/webp" }))).toEqual({ ids: [1] });
    expect(calls.find((c) => c[1] === "photocraft:open")![2].name).toBe("awarewave.webp");
    expect(calls.some((c) => c[1] === "layer.copyToDocument")).toBe(false);
  });

  it("selectedImage → 作用中像素圖層的範圍 PNG；非像素圖層 → null", async () => {
    const { ctx, calls, state } = mockPc();
    const s = await ctx.selectedImage();
    expect(s).toMatchObject({ id: 6, transform: [1, 0, 0, 1, 40, 60], width: 120, height: 80 });
    expect(await s.blob.text()).toBe("PNG");
    expect(calls.find((c) => c[1] === "layer.duplicate")![2]).toMatchObject({ layer: 6, document: "new", documentName: expect.stringMatching(/^awarewave-tmp-/) });
    expect(calls.find((c) => c[1] === "image.crop")![2]).toEqual({ x: 40, y: 60, width: 120, height: 80 });
    expect(calls.find((c) => c[1] === "file.close")![2]).toEqual({ document: 1, save: "discard" });
    state.layers[1].kind = "Shape";
    expect(await ctx.selectedImage()).toBeNull();
  });

  /** 暫用文件 = 新圖 size，修剪範圍 tb（PhotoCraft bounds 只算不透明）；copyToDocument 回 offset = 新圖 (0,0) 落點。 */
  const replaceMock = (size: [number, number], tb: number[], offset: [number, number] = [40, 60]) => {
    const isTemp = (s: any) => String(s.docs[s.active]?.name).startsWith("awarewave-tmp-");
    return mockPc({
      "document.inspect": (_p, s) => (isTemp(s) ? { width: size[0], height: size[1] } : { width: 400, height: 300, resolution: 72, hasSelection: s.hasSelection }),
      "layer.list": (_p, s) => ({ layers: isTemp(s) ? [{ id: 1, kind: "Pixel", bounds: tb }] : s.layers }),
      "layer.copyToDocument": (p, s) => (s.active = p.document, { document: p.document, layers: [99], offset }),
      "layer.delete": (p, s) => (s.layers = s.layers.filter((l: any) => l.id !== p.layer), null),
    });
  };

  it("replaceImage：新圖整張（含透明邊）對齊舊框、同名、刪舊；at 以修剪範圍算；同尺寸不縮放", async () => {
    const m = replaceMock([120, 80], [10, 5, 100, 70]);
    m.state.layers.push({ id: 99, name: "green", kind: "Pixel", bounds: [50, 65, 100, 70], active: false });
    expect(await m.ctx.replaceImage(6, new Blob(["n"], { type: "image/png" }))).toEqual({ id: 99 });
    expect(names(m.calls)).toEqual(["execute layer.list", "execute layer.select", "post photocraft:open", "execute document.inspect", "execute layer.list", "execute layer.copyToDocument", "execute file.close", "execute document.activate", "execute layer.delete", "execute layer.list"]);
    expect(m.calls.find((c) => c[1] === "layer.copyToDocument")![2]).toEqual({ document: 0, at: [100, 100], name: "green" });
    expect(m.calls.find((c) => c[1] === "layer.delete")![2]).toEqual({ layer: 6 });
  });

  it("replaceImage：換第二次以完整框為準（不縮回修剪範圍）；圖層被移動 → 框跟著平移；selectedImage 裁完整框", async () => {
    const m = replaceMock([120, 80], [10, 5, 100, 70]);
    let next = 99; // 每次 copy 一個新圖層 id，並照 offset＋tb 放進圖層清單（修剪範圍）
    const copy = (p: any, s: any) => {
      const id = next++;
      s.layers.forEach((l: any) => (l.active = false));
      s.layers.push({ id, name: p.name, kind: "Pixel", bounds: [p.at[0] - 50, p.at[1] - 35, 100, 70], active: true });
      s.active = p.document;
      return { document: p.document, layers: [id], offset: [40, 60] };
    };
    m.cw.photocraft.execute = ((orig) => (c: string, p: any) => (c === "layer.copyToDocument" ? (m.calls.push(["execute", c, p]), copy(p, m.state)) : orig(c, p)))(m.cw.photocraft.execute);
    m.state.layers = [{ id: 6, name: "green", kind: "Pixel", bounds: [40, 60, 120, 80], active: true }];
    expect(await m.ctx.replaceImage(6, new Blob(["a"], { type: "image/png" }))).toEqual({ id: 99 });
    expect(m.state.layers.map((l: any) => [l.id, l.bounds])).toEqual([[99, [50, 65, 100, 70]]]);
    m.state.layers[0].bounds = [55, 68, 100, 70]; // 使用者移動 (+5,+3)
    expect(await m.ctx.selectedImage()).toMatchObject({ id: 99, transform: [1, 0, 0, 1, 45, 63], width: 120, height: 80 });
    expect(m.calls.filter((c) => c[1] === "image.crop").at(-1)![2]).toEqual({ x: 45, y: 63, width: 120, height: 80 });
    m.calls.length = 0;
    expect(await m.ctx.replaceImage(99, new Blob(["b"], { type: "image/png" }))).toEqual({ id: 100 });
    expect(m.calls.some((c) => c[1] === "edit.transform")).toBe(false);
    expect(m.calls.find((c) => c[1] === "layer.copyToDocument")![2]).toMatchObject({ at: [105, 103] });
    // offset (40,60) ≠ 框左上 (45,63) → 整數平移，不重取樣；舊圖層 99 刪掉，只剩 100
    expect(m.calls.find((c) => c[1] === "layer.translate")![2]).toEqual({ layer: 100, dx: 5, dy: 3 });
    expect(m.calls.find((c) => c[1] === "layer.delete")![2]).toEqual({ layer: 99 });
    expect(m.state.layers.map((l: any) => l.id)).toEqual([100]);
  });

  it("replaceImage：尺寸不同 → edit.transform 把修剪範圍依「整張 → 框」比例縮進框", async () => {
    const m = replaceMock([60, 40], [6, 4, 30, 20]);
    await m.ctx.replaceImage(6, new Blob(["n"], { type: "image/png" }));
    expect(m.calls.find((c) => c[1] === "edit.transform")![2]).toEqual({ layer: 99, quad: [[52, 68], [112, 68], [112, 108], [52, 108]] });
    expect(m.calls.some((c) => c[1] === "layer.translate")).toBe(false);
  });

  it("exportArtboard：Export As 對話框欄位（WebP 有損、品質 0–1 → 1–100、ppi 不放大）", async () => {
    const { ctx, calls } = mockPc();
    const b = await ctx.exportArtboard({ format: "webp", ppi: 300, quality: 0.8 });
    expect(b.type).toBe("image/webp");
    const sets = calls.filter((c) => c[1] === "ui.dialog.set").map((c) => [c[2].field, c[2].value]);
    expect(sets).toEqual([["format", "webp"], ["sizing", "scale"], ["scale", 100], ["transparency", true], ["lossless", false], ["quality", 80]]);
    await expect(ctx.exportArtboard({ format: "gif" })).rejects.toThrow(/不支援/);
  });

  it("setArtboardSize：mm 以 dpi 換像素 → image.canvasSize；沒文件 → file.new", async () => {
    const { ctx, calls, state } = mockPc();
    expect(await ctx.setArtboardSize({ width: 210, height: 297, unit: "mm", dpi: 300 })).toEqual({ width: 2480, height: 3508, created: false });
    expect(calls.find((c) => c[1] === "image.canvasSize")![2]).toEqual({ width: 2480, height: 3508, units: "px", anchor: "center" });
    state.docs = [];
    expect((await ctx.setArtboardSize({ width: 100, height: 50 })).created).toBe(true);
    expect(calls.find((c) => c[1] === "file.new")![2]).toEqual({ width: 100, height: 50, mode: "rgb", depth: 8, background: "white" });
  });

  it("openFile → photocraft:open，等新文件出現；沒檔名 reject", async () => {
    const { ctx, calls } = mockPc();
    expect(await ctx.openFile(new Blob(["8BPS"]), "design.psd")).toBe(true);
    expect(calls.find((c) => c[1] === "photocraft:open")![2].name).toBe("design.psd");
    await expect(ctx.openFile(new Blob(["x"]))).rejects.toThrow(/檔名/);
  });

  it("saveAs → Save a Copy 的 PSD bytes", async () => {
    const { ctx, calls } = mockPc();
    const b = await ctx.saveAs();
    expect(await b.text()).toBe("8BPS");
    expect(b.type).toBe("image/vnd.adobe.photoshop");
    expect(calls.find((c) => c[1] === "ui.menu.invoke")![2]).toEqual({ id: "file.saveACopy" });
  });

  it("selectionMask：沒選取 → null；有 → 副本上白選取黑其餘、裁成作用中圖層範圍", async () => {
    const { ctx, calls, state } = mockPc();
    expect(await ctx.selectionMask()).toBeNull();
    state.hasSelection = true;
    expect(await (await ctx.selectionMask()).text()).toBe("PNG");
    const seq = names(calls).filter((n) => /image\.duplicate|layer\.new|edit\.fill|select\.|image\.crop/.test(n));
    expect(seq).toEqual(["execute image.duplicate", "execute layer.new.layer", "execute edit.fill", "execute select.inverse", "execute edit.fill", "execute select.deselect", "execute image.crop"]);
    expect(calls.filter((c) => c[1] === "edit.fill").map((c) => c[2].contents)).toEqual(["white", "black"]);
    expect(calls.find((c) => c[1] === "image.crop")![2]).toEqual({ x: 40, y: 60, width: 120, height: 80 });
  });

  it("fitLayer：等比置中的四角（fit／fill）", async () => {
    const { ctx, calls } = mockPc();
    expect(await ctx.fitLayer("fill")).toEqual({ id: 6 });
    expect(calls.find((c) => c[1] === "edit.transform")![2]).toEqual({ layer: 6, quad: fitQuad([40, 60, 120, 80], 400, 300, "fill") });
    expect(fitQuad([40, 60, 120, 80], 400, 300, "fit")).toEqual([[0, 16.666666666666657], [400, 16.666666666666657], [400, 283.33333333333337], [0, 283.33333333333337]]);
  });

  it("存檔沒人等 → 父頁下載；等的逾時 reject，之後才到的照樣下載（bytes 不丟）", async () => {
    const { ctx, save, downloads } = mockPc({ "ui.menu.invoke": () => ({ fileDialog: "save" }) });
    save("native.png", "N");
    await new Promise((r) => setTimeout(r, 5));
    expect(downloads).toEqual([["native.png", "N"]]);
    await expect(ctx.saveAs()).rejects.toThrow(/逾時/);
    save("late.psd", "L");
    await new Promise((r) => setTimeout(r, 5));
    expect(downloads).toEqual([["native.png", "N"], ["late.psd", "L"]]);
  });

  it("存檔以副檔名配對：等 PNG 時插進來的 PSD（使用者按原生另存）→ 下載，PNG 照樣交給等待者", async () => {
    const m = mockPc({ "ui.menu.invoke": (p: any) => { if (p.id === "file.export.quickExportAsPng") { m.save("user.psd", "8BPS"); m.save("x.png", "PNG"); } return {}; } });
    const s = await m.ctx.selectedImage();
    expect(await s.blob.text()).toBe("PNG");
    await new Promise((r) => setTimeout(r, 0));
    expect(m.downloads).toEqual([["user.psd", "8BPS"]]);
  });

  it("觸發存檔失敗 → 撤回等待者：下一筆存檔不會被吃掉（下載）", async () => {
    const m = mockPc({ "ui.menu.invoke": () => { throw new Error("menu broke"); } });
    await expect(m.ctx.saveAs()).rejects.toThrow(/menu broke/);
    m.save("late.psd", "L");
    await new Promise((r) => setTimeout(r, 0));
    expect(m.downloads).toEqual([["late.psd", "L"]]);
  });

  it("別的來源或別的 origin 的存檔不理（不交給等待者、不下載）", async () => {
    const m = mockPc();
    m.emit({ type: "photocraft:save", name: "evil.png", bytes: new ArrayBuffer(1) }, { source: {} });
    m.emit({ type: "photocraft:save", name: "evil.png", bytes: new ArrayBuffer(1) }, { origin: "http://evil.test" });
    await new Promise((r) => setTimeout(r, 0));
    expect(m.downloads).toEqual([]);
  });

  it("暫用文件開在最前面：copy 進原文件（此時 index 1）、關 index 0 的暫用文件、回到原文件（index 0）", async () => {
    const m = mockPc({}, { openAtFront: true });
    await m.ctx.placeImage(new Blob(["x"], { type: "image/png" }), "a.png");
    expect(m.calls.find((c) => c[1] === "layer.copyToDocument")![2]).toMatchObject({ document: 1 });
    expect(m.calls.find((c) => c[1] === "file.close")![2]).toEqual({ document: 0, save: "discard" });
    expect(m.calls.find((c) => c[1] === "document.activate")![2]).toEqual({ document: 0 });
  });

  it("暫用文件關不掉（file.close 失敗）→ 方法 reject，不回報成功", async () => {
    const m = mockPc({ "file.close": () => { throw new Error("close refused"); } });
    await expect(m.ctx.placeImage(new Blob(["x"], { type: "image/png" }), "a.png")).rejects.toThrow(/沒有正確關閉.*close refused/);
  });

  it("操作中使用者關掉前面的分頁 → 以名字找回原文件（copy 與 activate 都用新 index）", async () => {
    const m = mockPc({}, { onOpen: (st: any) => { st.docs.splice(0, 1); } });
    m.state.docs = [{ name: "other.png" }, { name: "base.png", width: 400, height: 300 }];
    m.state.active = 1;
    await m.ctx.placeImage(new Blob(["x"], { type: "image/png" }), "a.png");
    expect(m.calls.find((c) => c[1] === "layer.copyToDocument")![2]).toMatchObject({ document: 0 });
    expect(m.calls.find((c) => c[1] === "document.activate")![2]).toEqual({ document: 0 });
  });

  it("操作中原文件被關掉 → 中止（不 copy 進別的文件）", async () => {
    const m = mockPc({}, { onOpen: (st: any) => { st.docs.splice(0, 1); } });
    await expect(m.ctx.placeImage(new Blob(["x"], { type: "image/png" }), "a.png")).rejects.toThrow(/已關閉或分頁變動/);
    expect(m.calls.some((c) => c[1] === "layer.copyToDocument")).toBe(false);
  });

  it("selectionMask 中途失敗 → 副本照樣關掉、錯誤原樣拋出", async () => {
    const m = mockPc({ "edit.fill": () => { throw new Error("fill broke"); } });
    m.state.hasSelection = true;
    await expect(m.ctx.selectionMask()).rejects.toThrow(/fill broke/);
    expect(m.calls.find((c) => c[1] === "file.close")![2]).toEqual({ document: 1, save: "discard" });
    expect(m.state.docs.map((d: any) => d.name)).toEqual(["base.png"]);
  });

  it("photocraft:failed → ready reject 帶原因（只聽同源、來自 iframe 的訊息）", async () => {
    const m = mockPc();
    delete m.cw.photocraft; // wasm 起不來：window.photocraft 不會出現
    m.emit({ type: "photocraft:failed", error: "A browser with WebGPU or WebGL2 is required." });
    await new Promise((r) => setTimeout(r, 5));
    await expect(m.ctx.ready()).rejects.toThrow(/WebGL2/);
  });

  it("純函式：toQuality／toPixels／scaleFor", () => {
    expect(toQuality(0.9)).toBe(90);
    expect(toQuality(0)).toBe(1);
    expect(toQuality(150)).toBe(100);
    expect(toPixels(1, "in", 300)).toBe(300);
    expect(toPixels(72, "pt", 144)).toBe(144);
    expect(() => toPixels(-1)).toThrow();
    expect(scaleFor(36, 72)).toBe(50);
    expect(scaleFor(300, 72)).toBe(100);
  });
});

describe("新模組都能解析載入；零色碼", () => {
  it.each(["public/photo-pro-dock/dock.js", "public/editor-shared/ctx-photocraft.js"])("%s", async (rel) => {
    const mod = await loadModule(rel);
    expect(Object.keys(mod).length).toBeGreaterThan(0);
    const src = read(rel);
    expect(src.match(/#[0-9a-fA-F]{3,8}\b/), `${rel} 字面色`).toBeNull();
    expect(src.match(/\b(?:rgba?|hsla?)\(/), `${rel} 字面色`).toBeNull();
  });
});
