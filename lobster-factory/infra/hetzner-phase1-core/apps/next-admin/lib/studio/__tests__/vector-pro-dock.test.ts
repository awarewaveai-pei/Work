// 向量（專業版）第二 dock 欄（R0-PLAN §6 C4.4）：
// (1) dock.js 註冊表 = 十個面板 id；(2) ctx-vectorcraft.js 對 mock window.vectorcraft，每個契約方法一條；
// (3) 不變量（操作者 2026-11-05「要用統一的 class，這樣我改 theme 才會套用」）：dock 與面板的顏色只來自 app 主題 token，
//     零字面色；面板用 app 統一 class，不用舊 vector-editor 的 act／ghost。
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { createVectorcraftCtx } from "../../../public/editor-shared/ctx-vectorcraft.js";

const APP = path.resolve(__dirname, "..", "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(APP, rel), "utf8");

describe("dock.js 面板註冊表", () => {
  it("九個面板 id，順序同 R0-PLAN C4.2（字型面板 2026-11-05 取消）", () => {
    const src = read("public/vector-pro-dock/dock.js");
    const m = src.match(/export const PANEL_IDS = Object\.freeze\(\[([\s\S]*?)\]\)/);
    expect(m).not.toBeNull();
    const ids = [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    expect(ids).toEqual(["templates", "color-grade", "bg-remove", "webp", "my-designs", "qr", "barcode", "mockup", "batch-export"]);
  });
});

// ---- mock window.vectorcraft（介面同真品 apps/vectorcraft-web/src/api.rs install()） ----
type Call = [string, string, any];
function mockHost(handlers: Record<string, (p: any) => any> = {}, extra: Record<string, any> = {}, opts: Record<string, any> = {}) {
  const calls: Call[] = [];
  const kept = new Map<string, Uint8Array>();
  let capture = false;
  const run = async (kind: string, name: string, p: any) => {
    calls.push([kind, name, p]);
    const h = handlers[name];
    if (!h) throw new Error(`unexpected ${kind} ${name}`);
    return h(p);
  };
  const vectorcraft = {
    execute: (c: string, p: any) => run("execute", c, p),
    request: (m: string, p: any) => run("request", m, p),
    captureDownloads: (on: boolean) => {
      calls.push(["captureDownloads", String(on), null]);
      capture = on;
    },
    files: () => [...kept].map(([p, b]) => ({ path: p, size: b.length })),
    readFile: (p: string) => kept.get(p),
    keep: (p: string, b: Uint8Array) => capture && kept.set(p, b),
    ...extra,
  };
  const frame = { contentWindow: { vectorcraft } } as unknown as HTMLIFrameElement;
  const ctx = createVectorcraftCtx({ frame: () => frame, timeoutMs: 50, pollMs: 5, ...opts });
  return { ctx, calls, vectorcraft };
}
const b64 = (s: string) => Buffer.from(s, "binary").toString("base64");
const text = async (b: Blob) => Buffer.from(await b.arrayBuffer()).toString("binary");
const info = (id: number, px: [number, number], ppi: [number, number]) => ({ id, pixelWidth: px[0], pixelHeight: px[1], ppi });

describe("ctx-vectorcraft.js 契約（mock vectorcraft）", () => {
  it("placeSvg → file.place 帶 SVG bytes", async () => {
    const { ctx, calls } = mockHost({ "file.place": () => ({ ids: [7] }) });
    expect(await ctx.placeSvg("<svg/>")).toEqual({ ids: [7] });
    expect(calls[0][2]).toEqual({ name: "awarewave.svg", dataBase64: b64("<svg/>") });
    // 置入成多個物件時群組成一個（QR／條碼不能是幾百個散物件）
    const many = mockHost({ "file.place": () => ({ ids: [1, 2, 3] }), "object.group": () => ({ id: 9 }) });
    expect(await many.ctx.placeSvg("<svg/>")).toEqual({ ids: [9] });
    expect(many.calls[1]).toEqual(["execute", "object.group", { ids: [1, 2, 3] }]);
  });

  it("placeImage → file.place，副檔名跟 MIME", async () => {
    const { ctx, calls } = mockHost({ "file.place": () => ({ ids: [3] }) });
    expect(await ctx.placeImage(new Blob(["PNG"], { type: "image/png" }))).toEqual({ ids: [3] });
    expect(calls[0][2]).toEqual({ name: "awarewave.png", dataBase64: b64("PNG") });
  });

  it("selectedImage → 原檔 bytes + xf；沒選圖片 → null", async () => {
    const xf = [1, 0, 0, 1, 10, 20];
    const { ctx } = mockHost({
      "image.info": () => info(5, [2, 3], [72, 72]),
      "document.node": () => ({ id: 5, kind: { type: "image", key: "k", width: 2, height: 3, xf } }),
      "links.unembed": () => ({ name: "a.jpg", dataBase64: b64("JPG") }),
    });
    const s = await ctx.selectedImage();
    expect({ id: s.id, transform: s.transform, width: s.width, height: s.height, type: s.blob.type }).toEqual({ id: 5, transform: xf, width: 2, height: 3, type: "image/jpeg" });
    expect(await text(s.blob)).toBe("JPG");
    const none = mockHost({ "image.info": () => { throw new Error("select one image or pass id"); } });
    expect(await none.ctx.selectedImage()).toBeNull();
  });

  it("replaceImage → select.set + file.place replace；實體尺寸不同才 object.scale 縮回", async () => {
    // 同尺寸：一個 file.place，不縮放
    const same = mockHost({
      "image.info": (p) => info(p.id, [100, 50], [144, 144]),
      "select.set": () => ({}),
      "file.place": () => ({ ids: [9] }),
    });
    expect(await same.ctx.replaceImage(4, new Blob(["x"], { type: "image/png" }))).toEqual({ id: 9 });
    expect(same.calls.map((c) => c[1])).toEqual(["image.info", "select.set", "file.place", "image.info"]);
    expect(same.calls[2][2]).toMatchObject({ replace: true, name: "awarewave.png" });
    // 300 ppi 原圖換成 72 ppi PNG：新圖大 300/72 倍 → 等比縮回
    const ppi = mockHost({
      "image.info": (p) => (p.id === 4 ? info(4, [100, 50], [600, 600]) : info(9, [100, 50], [144, 144])),
      "select.set": () => ({}),
      "file.place": () => ({ ids: [9] }),
      "object.scale": () => ({ ids: [9] }),
    });
    await ppi.ctx.replaceImage(4, new Blob(["x"], { type: "image/png" }));
    const scale = ppi.calls.find((c) => c[1] === "object.scale")!;
    expect(scale[2].ids).toEqual([9]);
    expect(scale[2].sx).toBeCloseTo(24, 9);
    expect(scale[2].sy).toBeCloseTo(24, 9);
  });

  it("exportArtboard → app.export 不帶 path，回 Blob", async () => {
    const { ctx, calls } = mockHost({ "app.export": () => ({ dataBase64: b64("WEBP"), format: "webp", bytes: 4 }) });
    const blob = await ctx.exportArtboard({ format: "webp", quality: 80, background: "transparent" });
    expect(calls[0]).toEqual(["request", "app.export", { format: "webp", quality: 80, background: "transparent" }]);
    expect(blob.type).toBe("image/webp");
    expect(await text(blob)).toBe("WEBP");
    // 真品只收 0–100 整數（u8）：webp.js 傳 0.9 被拒 "invalid type: floating point 0.9, expected u8"
    const frac = mockHost({ "app.export": () => ({ dataBase64: b64("W") }) });
    await frac.ctx.exportArtboard({ format: "webp", quality: 0.9 });
    expect(frac.calls[0][2]).toEqual({ format: "webp", quality: 90 });
  });

  it("setArtboardSize → artboard.setProps（pt）；沒文件就 file.new", async () => {
    const { ctx, calls } = mockHost({ "artboard.setProps": () => null });
    expect(await ctx.setArtboardSize({ width: 210, height: 297, unit: "mm", dpi: 300 })).toMatchObject({ created: false });
    expect(calls[0][1]).toBe("artboard.setProps");
    expect(calls[0][2].index).toBe(0);
    expect(calls[0][2].width).toBeCloseTo(595.2756, 3);
    expect(calls[0][2].height).toBeCloseTo(841.8898, 3);
    const px = mockHost({ "artboard.setProps": () => null });
    await px.ctx.setArtboardSize({ width: 1080, height: 1080, unit: "px", dpi: 300 });
    expect(px.calls[0][2].width).toBeCloseTo(259.2, 6);
    const none = mockHost({ "artboard.setProps": () => { throw new Error("no document"); }, "file.new": () => ({}) });
    expect(await none.ctx.setArtboardSize({ width: 90, height: 54, unit: "mm" })).toMatchObject({ created: true });
    expect(none.calls[1][1]).toBe("file.new");
    expect(none.calls[1][2]).toMatchObject({ units: "Millimeters" });
    await expect(mockHost().ctx.setArtboardSize({ width: 0, height: 1, unit: "mm" })).rejects.toThrow(/尺寸/);
  });


  it("openFile → vectorcraft.openFile(name, bytes)；沒檔名就 reject", async () => {
    const got: [string, number[]][] = [];
    const { ctx } = mockHost({}, { openFile: (n: string, b: Uint8Array) => (got.push([n, [...b]]), true) });
    expect(await ctx.openFile(new Blob([new Uint8Array([7, 8])]), "a.vectorcraft")).toBe(true);
    expect(got).toEqual([["a.vectorcraft", [7, 8]]]);
    await expect(ctx.openFile(new Blob(["x"]), "")).rejects.toThrow(/檔名/);
  });


  it("saveAs → file.saveCopy 被 captureDownloads 攔下，讀回 bytes 後關閉攔截", async () => {
    const host = mockHost({
      "file.saveCopy": (p) => {
        host.vectorcraft.keep(p.path, new Uint8Array([86, 67]));
        return { path: p.path };
      },
    });
    const blob = await host.ctx.saveAs();
    expect(await text(blob)).toBe("VC");
    const save = host.calls.find((c) => c[1] === "file.saveCopy")!;
    expect(save[2]).toMatchObject({ format: "vectorcraft" });
    expect(host.calls.filter((c) => c[0] === "captureDownloads").map((c) => c[1])).toEqual(["true", "false"]);
  });

  it("info(msg) / busy(on) 交給 dock；宿主未載入 ready reject", async () => {
    const seen: unknown[] = [];
    const { ctx } = mockHost({}, {}, { onInfo: (m: string) => seen.push(["info", m]), onBusy: (b: boolean) => seen.push(["busy", b]) });
    ctx.info("✅ 完成");
    ctx.busy(true);
    ctx.busy(false);
    expect(seen).toEqual([["info", "✅ 完成"], ["busy", true], ["busy", false]]);
    expect(() => mockHost().ctx.info("沒有 dock 也不炸")).not.toThrow();
    const absent = createVectorcraftCtx({ frame: () => undefined, timeoutMs: 20, pollMs: 5 });
    await expect(absent.ready()).rejects.toThrow(/尚未載入/);
  });
});

// ---- 主題不變量 ----
const ROOT_TOKENS = (() => {
  const css = read("app/globals.css");
  const root = css.slice(css.indexOf(":root {"), css.indexOf("\n}", css.indexOf(":root {")));
  return new Set([...root.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
})();
const BLOCKS_DIR = "public/editor-shared/blocks";
/** dock 會載入的面板（dock.js PANEL_IDS）；資料夾裡沒登記的檔不算面板。 */
const blockFiles = () => {
  const m = read("public/vector-pro-dock/dock.js").match(/export const PANEL_IDS = Object\.freeze\(\[([\s\S]*?)\]\)/);
  return [...m![1].matchAll(/"([^"]+)"/g)].map((x) => `${BLOCKS_DIR}/${x[1]}.js`);
};
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const FUNC_COLOR = /\b(?:rgba?|hsla?)\(/;
/** 只看樣式：style="…"、.style.x = …、cssText、fillStyle 以外的 CSS 文字（面板裡的 #ffffff 預設值、畫布 fillStyle 是資料不是樣式）。 */
const styleSnippets = (src: string) => [
  ...[...src.matchAll(/style\s*=\s*\\?["']([^"'\\]*)/g)].map((m) => m[1]),
  ...[...src.matchAll(/\.style\.(?!cssText)[a-zA-Z]+\s*=\s*([^;\n]+)/g)].map((m) => m[1]),
  ...[...src.matchAll(/cssText\s*=\s*([^;\n]+)/g)].map((m) => m[1]),
];
const unknownVars = (src: string, own: Set<string>) =>
  [...src.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]).filter((v) => !ROOT_TOKENS.has(v) && !own.has(v));

describe("dock 外殼（editor-shared/dock.css＋dock.js）顏色只來自主題 token、尺寸只來自各編輯器 SIZES", () => {
  const css = read("public/editor-shared/dock.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const shared = read("public/editor-shared/dock.js");
  // mountDock 寫在 root 上的 --vp-*（SIZE_VARS 的值）
  const sizeVars = new Map(
    [...shared.match(/export const SIZE_VARS = Object\.freeze\(\{([\s\S]*?)\}\)/)![1].matchAll(/(\w+):\s*"(--vp-[a-z-]+)"/g)].map((m) => [m[1], m[2]]),
  );
  // --swatch：色相範圍本身的顏色（資料色），由 blocks/color-grade.js 設在按鈕上；唯一允許的非主題、非尺寸變數
  const own = new Set([...sizeVars.values(), "--swatch"]);
  it("dock.css 無字面色（#hex／rgb()／hsl()），不定義 --vp-*（數值只在各編輯器 dock.js 的 SIZES）", () => {
    expect(css.match(HEX)).toBeNull();
    expect(css.match(FUNC_COLOR)).toBeNull();
    expect(css.match(/--vp-[a-z0-9-]+\s*:/g)).toBeNull();
  });
  it("dock.css 用到的 var() 都是 globals.css :root 的 token 或 mountDock 寫的 --vp-*；每個 --vp-* 都有用到", () => {
    expect(unknownVars(css, own)).toEqual([]);
    const used = new Set([...css.matchAll(/var\(\s*(--vp-[a-z0-9-]+)/g)].map((m) => m[1]));
    expect([...used].sort()).toEqual([...sizeVars.values()].sort());
  });
  it("dock.js（共用外殼與向量清單）無字面色，元件用 app 統一 class", () => {
    for (const js of [shared, read("public/vector-pro-dock/dock.js")]) {
      expect(js.match(HEX)).toBeNull();
      expect(js.match(FUNC_COLOR)).toBeNull();
    }
    for (const cls of ["tab-bar", "tab tab--active", "card vp-flyout"]) expect(shared).toContain(cls);
  });
  it("向量 SIZES = 真品 panel_docking.rs:36-43 與 dock_style tab_height 33；鍵 = SIZE_VARS", async () => {
    const { SIZES } = await loadModule("public/vector-pro-dock/dock.js");
    expect(Object.keys(SIZES).sort()).toEqual([...sizeVars.keys()].sort());
    expect(SIZES).toEqual({ rail: 38, button: 30, panel: 310, panelMin: 220, panelMax: 720, tab: 33, pad: 10 });
  });
});

describe("面板模組（editor-shared/blocks）用統一 class、樣式只用主題 token", () => {
  it.each(blockFiles())("%s", (f) => {
    const src = read(f);
    const classes = [...src.matchAll(/class(?:Name)?\s*[=:]\s*\\?["'`]([^"'`\\]*)/g)].flatMap((m) => m[1].split(/\s+/));
    expect(classes.filter((c) => c === "act" || c === "ghost"), "舊 class act→btn btn-primary、ghost→btn btn-secondary").toEqual([]);
    for (const snip of styleSnippets(src)) {
      expect(snip.match(HEX), `${f} 樣式字面色：${snip}`).toBeNull();
      expect(snip.match(FUNC_COLOR), `${f} 樣式字面色：${snip}`).toBeNull();
    }
    expect(unknownVars(src, new Set()), `${f} 用了主題沒有的變數`).toEqual([]);
  });
});

// ---- 每個瀏覽器模組都能載入（關整類：2026-11-05 blocks/color-grade.js:108 行中註解吞掉程式，
//      color-grade／bg-remove／my-designs 三個面板整個載入失敗，而全套 vitest 是綠的，因為沒有測試載入面板模組） ----
// 做法：esbuild 把模組連同它 import 的 /editor-shared/… 打包（站台絕對路徑對到 public/），再以 data: URL import。
// 選 esbuild 而非 node --check（next-admin 無 "type":"module"，.js 會被當 CJS，import 語法誤判）或
// vm.SourceTextModule（要 --experimental-vm-modules 旗標，vitest worker 沒開）；esbuild 已是依賴、同進程、
// 錯誤訊息帶 file:line，而且連被 import 的檔案一起檢查。只載入模組本體，不執行 mount／不掛 dock（node 無 document）。
const PUBLIC = path.join(APP, "public");
async function loadModule(rel: string) {
  const out = await build({
    entryPoints: [path.join(APP, rel)],
    bundle: true,
    format: "esm",
    platform: "neutral",
    write: false,
    logLevel: "silent",
    plugins: [{
      name: "site-root",
      setup(b) {
        b.onResolve({ filter: /^\/(editor-shared|vector-pro-dock)\// }, (a) => ({ path: path.join(PUBLIC, a.path) }));
      },
    }],
  });
  const code = out.outputFiles[0].text;
  return import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

describe("瀏覽器模組都能被解析與載入成 ES module", () => {
  it.each(["public/vector-pro-dock/dock.js", "public/editor-shared/dock.js", "public/editor-shared/ctx-vectorcraft.js"])("%s", async (rel) => {
    const mod = await loadModule(rel);
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });
  it.each(blockFiles())("%s：default export 有 id／title／mount", async (rel) => {
    const mod = await loadModule(rel);
    const d = mod.default;
    expect(d?.id).toBe(path.basename(rel, ".js"));
    expect(typeof d?.title).toBe("string");
    expect(typeof d?.mount).toBe("function");
  });
});

// ---- 面板呼叫的 ctx 方法 = 轉接器與契約提供的（關整類：2026-11-05 正式站範本庫無效，templates.js 呼叫的
//      setArtboardSize 轉接器沒有；ctx.info(msg) 被各面板當函式呼叫，轉接器卻是物件） ----
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const calledCtxMethods = () => {
  const out = new Map<string, string[]>();
  for (const f of blockFiles()) {
    for (const m of stripComments(read(f)).matchAll(/\bctx\.([A-Za-z_$][\w$]*)\s*\(/g)) {
      out.set(m[1], [...(out.get(m[1]) ?? []), path.basename(f)]);
    }
  }
  return out;
};

describe("面板呼叫的每個 ctx 方法都在轉接器與契約裡", () => {
  const called = calledCtxMethods();
  const ctx = createVectorcraftCtx({ frame: () => undefined, timeoutMs: 1 }) as Record<string, unknown>;
  const contract = read("public/editor-shared/ctx-contract.md");
  it("面板確實有呼叫 ctx（掃描沒有失效）", () => {
    expect(called.size).toBeGreaterThan(5);
  });
  it.each([...calledCtxMethods().keys()].sort())("ctx.%s", (name) => {
    expect(contract, `${name} 沒寫進 ctx-contract.md`).toContain(`\`${name}(`);
    // 契約「選用」：向量宿主可以沒有，呼叫它的面板要先判斷（例 templates.js 的 fitLayer 只在畫布出現）
    if (!(name in ctx) && /\*\*選用。\*\*/.test(contract.split("\n").find((l) => l.startsWith(`| \`${name}(`)) ?? "")) {
      for (const f of called.get(name)!) expect(read(`public/editor-shared/blocks/${f}`), `${f} 呼叫選用的 ${name} 前沒判斷`).toContain(`typeof ctx.${name}`);
      return;
    }
    expect(typeof ctx[name], `${name} 被 ${called.get(name)!.join("、")} 呼叫，轉接器沒有這個函式`).toBe("function");
  });
});
