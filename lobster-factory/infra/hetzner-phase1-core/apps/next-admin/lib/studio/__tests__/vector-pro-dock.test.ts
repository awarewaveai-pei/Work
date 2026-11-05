// 向量（專業版）第二 dock 欄（R0-PLAN §6 C4.4）：
// (1) dock.js 註冊表 = 十個面板 id；(2) ctx-vectorcraft.js 對 mock window.vectorcraft，每個契約方法一條；
// (3) 不變量（操作者 2026-11-05「要用統一的 class，這樣我改 theme 才會套用」）：dock 與面板的顏色只來自 app 主題 token，
//     零字面色；面板用 app 統一 class，不用舊 vector-editor 的 act／ghost。
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createVectorcraftCtx } from "../../../public/editor-shared/ctx-vectorcraft.js";

const APP = path.resolve(__dirname, "..", "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(APP, rel), "utf8");

describe("dock.js 面板註冊表", () => {
  it("十個面板 id，順序同 R0-PLAN C4.2", () => {
    const src = read("public/vector-pro-dock/dock.js");
    const m = src.match(/export const PANEL_IDS = Object\.freeze\(\[([\s\S]*?)\]\)/);
    expect(m).not.toBeNull();
    const ids = [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    expect(ids).toEqual(["templates", "fonts", "color-grade", "bg-remove", "webp", "my-designs", "qr", "barcode", "mockup", "batch-export"]);
  });
});

// ---- mock window.vectorcraft（介面同真品 apps/vectorcraft-web/src/api.rs install()） ----
type Call = [string, string, any];
function mockHost(handlers: Record<string, (p: any) => any> = {}, extra: Record<string, any> = {}) {
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
  const ctx = createVectorcraftCtx({ frame: () => frame, timeoutMs: 50, pollMs: 5 });
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
  });

  it("openFile → vectorcraft.openFile(name, bytes)；沒檔名就 reject", async () => {
    const got: [string, number[]][] = [];
    const { ctx } = mockHost({}, { openFile: (n: string, b: Uint8Array) => (got.push([n, [...b]]), true) });
    expect(await ctx.openFile(new Blob([new Uint8Array([7, 8])]), "a.vectorcraft")).toBe(true);
    expect(got).toEqual([["a.vectorcraft", [7, 8]]]);
    await expect(ctx.openFile(new Blob(["x"]), "")).rejects.toThrow(/檔名/);
  });

  it("addFont → vectorcraft.addFont；沒有 C1.4 補丁就 reject", async () => {
    const got: Uint8Array[] = [];
    const { ctx } = mockHost({}, { addFont: (b: Uint8Array) => (got.push(b), 1) });
    expect(await ctx.addFont(new Uint8Array([1, 2]).buffer)).toBe(1);
    expect([...got[0]]).toEqual([1, 2]);
    await expect(mockHost().ctx.addFont(new Uint8Array([1]))).rejects.toThrow(/C1\.4/);
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

  it("info / busy / ready：執行中 busy，宿主未載入 ready reject", async () => {
    let release!: () => void;
    const { ctx } = mockHost({ "file.place": () => new Promise((r) => (release = () => r({ ids: [1] }))) });
    expect(ctx.info).toEqual({ host: "vectorcraft", contract: 1 });
    const p = ctx.placeSvg("<svg/>");
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.busy).toBe(true);
    release();
    await p;
    expect(ctx.busy).toBe(false);
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
const blockFiles = () => fs.readdirSync(path.join(APP, BLOCKS_DIR)).filter((f) => f.endsWith(".js")).map((f) => `${BLOCKS_DIR}/${f}`);
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

describe("dock 顏色只來自主題 token", () => {
  const css = read("public/vector-pro-dock/theme.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const own = new Set([...css.matchAll(/(--vp-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  it("theme.css 無字面色（#hex／rgb()／hsl()），--vp-* 只放版面尺寸", () => {
    expect(css.match(HEX)).toBeNull();
    expect(css.match(FUNC_COLOR)).toBeNull();
    for (const m of css.matchAll(/--vp-[a-z0-9-]+\s*:\s*([^;]+);/g)) expect(m[1].trim(), m[0]).toMatch(/^\d+px$/);
  });
  it("theme.css 用到的 var() 都是 globals.css :root 的 token", () => {
    expect(unknownVars(css, own)).toEqual([]);
  });
  it("dock.js 無字面色，元件用 app 統一 class", () => {
    const js = read("public/vector-pro-dock/dock.js");
    expect(js.match(HEX)).toBeNull();
    expect(js.match(FUNC_COLOR)).toBeNull();
    for (const cls of ["tab-bar", "tab tab--active", "card vp-flyout"]) expect(js).toContain(cls);
  });
  it("尺寸 = 真品 panel_docking.rs:36-43 與 dock_style tab_height 33", () => {
    const t = Object.fromEntries([...css.matchAll(/--vp-([a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
    expect([t["column-width"], t["column-min"], t["column-max"], t["icon-width"], t["panel-min"], t["tab-height"]]).toEqual(["310px", "220px", "720px", "38px", "220px", "33px"]);
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
