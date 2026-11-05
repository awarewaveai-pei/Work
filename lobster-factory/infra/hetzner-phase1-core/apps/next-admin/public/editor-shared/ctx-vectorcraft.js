// ctx 契約（ctx-contract.md）對真品 VectorCraft 的實作：全部走 iframe 的 window.vectorcraft
// （storytold/vectorcraft apps/vectorcraft-web/src/api.rs:1-17；指令語意見其 docs/control-protocol.md）。
// 面板模組只拿 ctx，不碰 vectorcraft；換宿主（舊 Fabric 編輯器）= 換一個 ctx-*.js。
// 測試：lib/studio/__tests__/vector-pro-dock.test.ts（mock vectorcraft，每個方法一條）。

const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml", pdf: "application/pdf", vectorcraft: "application/octet-stream" };
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg" };

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function base64ToBlob(b64, type) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 長度 → 點（pt，真品文件座標）。px 以 dpi 換成實體長度（1 in = 72 pt）。 */
const PER_UNIT = { pt: 1, in: 72, mm: 72 / 25.4, cm: 72 / 2.54 };
export function toPoints(value, unit = "pt", dpi = 72) {
  const v = Number(value);
  const k = unit === "px" ? 72 / (Number(dpi) > 0 ? Number(dpi) : 72) : PER_UNIT[unit];
  if (!(v > 0) || !Number.isFinite(v) || !k) throw new Error(`尺寸不正確：${value} ${unit}`);
  return v * k;
}
/** file.new 的 units 名（engine cmd/edit.rs:26）。 */
const UNIT_NAME = { pt: "Points", in: "Inches", mm: "Millimeters", cm: "Centimeters", px: "Pixels" };

/** 匯出品質 → 真品要的 0–100 整數（u8；傳 0.9 會被拒 "invalid type: floating point"）。0–1 視為比例。 */
export function toQuality(q) {
  const n = Number(q);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(Math.min(100, Math.max(0, n <= 1 ? n * 100 : n)));
}

// 匯入舊專案（.design.json → SVG）：原在 blocks/my-designs.js，宿主才有的能力（契約 importLegacy），逐字搬入。
// 載入路徑 = vector-editor.html:1293-1317，normalizeV7Types :1288-1292，SVG 尺寸 = exportSvg :970-973；Fabric 走 /editor-shared/blocks/color-grade.js 的 ensureFabric()。
// vector-editor.html:442-443
const FABRIC_LOADER = "/editor-shared/blocks/color-grade.js";
const toPx = (val, unit, dpi) => { if (unit === "px") return Math.round(val); const cm = unit === "mm" ? val / 10 : val; return Math.round(cm * dpi / 2.54); };
const toCm = (val, unit, dpi) => (unit === "px" ? +(val * 2.54 / dpi).toFixed(2) : unit === "mm" ? val / 10 : val);
// vector-editor.html:1288-1292 (/tools/canvas Fabric 7 type names -> Fabric 5)
function normalizeV7Types(node) {
  if (!node || typeof node !== "object") return;
  if (typeof node.type === "string" && /^[A-Z]/.test(node.type)) node.type = node.type.replace(/^([A-Z])([A-Z])/, "$1-$2").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  (node.objects || []).forEach(normalizeV7Types); if (node.clipPath) normalizeV7Types(node.clipPath);
}

/** 宿主描述（契約 host）：My Designs 面板的存檔標記與清單過濾只讀這裡，不寫死編輯器名。 */
export const VECTORCRAFT_HOST = Object.freeze({
  id: "vectorcraft",
  label: "向量",
  sourceExt: ".vectorcraft",
  sourceName: "design.vectorcraft",
  saveTag: Object.freeze({ source: "vector-pro", modelName: "vector-pro", prompt: "vector edit" }),
  listSources: Object.freeze(["vector-editor", "vector-pro"]), // vector-editor = 舊編輯器寫過的 metadata.source
});

/**
 * @param {{frame: () => (HTMLIFrameElement|undefined), timeoutMs?: number, pollMs?: number,
 *          onInfo?: (msg: string) => void, onBusy?: (on: boolean) => void}} opts
 *   frame（必填）：回傳宿主 iframe；由 dock 外殼明確傳入（頁框掛的 window.__proEditor.frame），這裡不再有全域預設。
 *   onInfo／onBusy：面板的狀態訊息與忙碌顯示，由 dock 決定畫在哪。
 */
export function createVectorcraftCtx(opts) {
  const frame = opts?.frame;
  if (typeof frame !== "function") throw new Error("createVectorcraftCtx 需要 opts.frame（回傳宿主 iframe 的函式）");
  const timeoutMs = opts.timeoutMs ?? 30000;
  const pollMs = opts.pollMs ?? 200;
  let queue = Promise.resolve(); // ctx 呼叫一次跑一個：選取與 captureDownloads 都是宿主全域狀態

  /** 等到 iframe 內 window.vectorcraft 出現（wasm 啟動前不存在）。同源才讀得到。 */
  async function vc() {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const api = frame()?.contentWindow?.vectorcraft;
      if (api) return api;
      if (Date.now() >= end) throw new Error("VectorCraft 尚未載入（window.vectorcraft 不存在）");
      await sleep(pollMs);
    }
  }

  /** 每個對外方法包一層：排隊一次一個。 */
  const op = (fn) => (...args) => {
    const run = queue.then(async () => fn(await vc(), ...args));
    queue = run.catch(() => {});
    return run;
  };

  async function place(api, name, data, extra) {
    const dataBase64 = typeof data === "string" ? data : await blobToBase64(data);
    const r = await api.execute("file.place", { name, dataBase64, ...extra });
    if (!r?.ids?.length) throw new Error("file.place 沒有置入任何物件");
    return { ids: r.ids };
  }

  /** 圖片本身（不含旋轉）的實體邊長 pt：像素 × 72 / 有效 ppi（image.info）。axis 0 = 寬，1 = 高。 */
  const intrinsic = (info, axis) => (axis ? info.pixelHeight : info.pixelWidth) * (72 / info.ppi[axis]);

  async function imageOf(api, id) {
    const node = await api.execute("document.node", { id });
    const image = node?.kind?.type === "image" ? node.kind : null; // {type:"image", key, width, height, xf:[a,b,c,d,e,f]}
    if (!image) return null;
    // links.unembed 不帶 path = 只回像素，不改文件（engine cmd/links.rs:105）
    const { name, dataBase64 } = await api.execute("links.unembed", { id });
    const type = MIME[String(name).split(".").pop().toLowerCase()] || "image/png";
    return { id, blob: base64ToBlob(dataBase64, type), transform: image.xf ?? null, width: image.width, height: image.height };
  }

  const ctx = {
    host: VECTORCRAFT_HOST,
    /** 面板狀態訊息（同步，不排隊）。 */
    info: (msg) => opts.onInfo?.(String(msg ?? "")),
    /** 面板告知忙碌中／結束（同步，不排隊）。 */
    busy: (on) => opts.onBusy?.(!!on),
    ready: () => vc().then(() => true),

    /** 置入 SVG 字串，置中於視窗；多個物件群組成一個（object.group，engine cmd/object/commands.rs:135）並選取；回 {ids}。 */
    placeSvg: op(async (api, svg, name = "awarewave.svg") => {
      const { ids } = await place(api, name, new Blob([svg], { type: "image/svg+xml" }));
      if (ids.length < 2) return { ids };
      const g = await api.execute("object.group", { ids });
      return { ids: [g.id] };
    }),

    /** 置入點陣圖（內嵌），置中並選取；回 {ids}。 */
    placeImage: op((api, blob, name) => place(api, name || `awarewave.${EXT[blob.type] || "png"}`, blob)),

    /** 目前唯一選取的圖片 → {id, blob, transform, width, height}；沒選、選多個或不是圖片 → null。 */
    selectedImage: op(async (api) => {
      let info;
      try {
        info = await api.execute("image.info", {}); // 預設 = 唯一選取的圖片（engine cmd/place.rs image_info）
      } catch (err) {
        if (/select one image|is not an image/.test(String(err?.message))) return null; // engine cmd/place.rs image_info
        throw err;
      }
      return imageOf(api, info.id);
    }),

    /** 以新像素換掉圖片 id：位置（中心）、大小、旋轉、堆疊位置不變；選取新圖；回 {id}。
     *  file.place replace 是一個 undo 步，保留舊圖的變形但以新檔的實體尺寸（像素 × 檔案 ppi）為 100%；
     *  新舊實體尺寸不同（例如 canvas PNG 無 ppi = 72、原圖 JPEG 300 ppi）時再以中心等比縮回舊尺寸（第二個 undo 步）。 */
    replaceImage: op(async (api, id, blob) => {
      const data = await blobToBase64(blob); // 先算好：select.set 與 file.place 之間不再讓出
      const before = await api.execute("image.info", { id });
      await api.execute("select.set", { ids: [id] });
      const { ids } = await place(api, `awarewave.${EXT[blob.type] || "png"}`, data, { replace: true });
      const after = await api.execute("image.info", { id: ids[0] });
      const k = Math.min(intrinsic(before, 0) / intrinsic(after, 0), intrinsic(before, 1) / intrinsic(after, 1));
      if (Number.isFinite(k) && Math.abs(k - 1) > 1e-6) await api.execute("object.scale", { ids: [ids[0]], sx: k * 100, sy: k * 100 });
      return { id: ids[0] };
    }),

    /** 以新文件分頁開檔（.vectorcraft／SVG／PDF／.ai…，同拖進分頁列的檔案）；回 true = 已排入。 */
    openFile: op(async (api, blob, name) => {
      if (!name) throw new Error("openFile 需要檔名（副檔名決定格式）");
      return api.openFile(name, new Uint8Array(await blob.arrayBuffer()));
    }),

    /** 匯出整個畫板 → Blob（app.export 不帶 path 回 dataBase64）。 */
    exportArtboard: op(async (api, o = {}) => {
      const format = o.format || "png";
      const params = { format };
      for (const k of ["ppi", "background", "artboard", "width", "height"]) if (o[k] !== undefined) params[k] = o[k];
      const q = toQuality(o.quality);
      if (q !== undefined) params.quality = q;
      const r = await api.request("app.export", params);
      return base64ToBlob(r.dataBase64, MIME[format] || "application/octet-stream");
    }),


    /** 畫板改尺寸：第一個畫板 artboard.setProps {index:0, width, height}（engine cmd/layer.rs:158，pt）；
     *  沒有開啟的文件就 file.new 一份該尺寸（cmd/edit.rs:26）。unit：mm／cm／in／pt／px（px 以 dpi 換算）。 */
    setArtboardSize: op(async (api, { width, height, unit = "px", dpi = 72 } = {}) => {
      const w = toPoints(width, unit, dpi);
      const h = toPoints(height, unit, dpi);
      try {
        await api.execute("artboard.setProps", { index: 0, width: w, height: h });
        return { width: w, height: h, created: false };
      } catch (err) {
        if (!/no (active )?document/i.test(String(err?.message))) throw err;
        await api.execute("file.new", { width: w, height: h, units: UNIT_NAME[unit] || "Points" });
        return { width: w, height: h, created: true };
      }
    }),


    /** 目前文件存成 .vectorcraft → Blob；用 Save a Copy，不改文件自己的路徑與標題。 */
    saveAs: op(async (api) => {
      const path = `awarewave-${Date.now()}.vectorcraft`;
      api.captureDownloads(true);
      try {
        await api.execute("file.saveCopy", { path, format: "vectorcraft" });
        const kept = api.files().find((f) => f.path === path || String(f.path).endsWith(path));
        if (!kept) throw new Error("存檔沒有被攔下（captureDownloads）");
        return new Blob([api.readFile(kept.path)], { type: MIME.vectorcraft });
      } finally {
        api.captureDownloads(false);
      }
    }),

    /** 選用（向量宿主才有）：舊專案 .design.json → Fabric StaticCanvas → SVG → placeSvg；回 {objects} = 轉入的物件數。 */
    importLegacy: async (file) => {
      let sc = null;
      try {
        // 動態、站台絕對路徑：只有匯入舊專案才載入（含 Fabric 載入器），單元測試載入本檔時不解析（同 dock.js 對 /editor-shared/ 的寫法）。
        const fabric = await (await import(/* @vite-ignore */ FABRIC_LOADER)).ensureFabric();
        const data = JSON.parse(await file.text());
        const mt = data.meta;
        const okMeta = mt && ["cm", "mm", "px"].includes(mt.unit) && mt.wv > 0 && mt.hv > 0 && mt.dpi >= 1 && mt.dpi <= 2400;
        const fab = data.json || data.canvas || data; normalizeV7Types(fab);
        const realW = okMeta ? toPx(mt.wv, mt.unit, mt.dpi) : (+data.w || 1063), realH = okMeta ? toPx(mt.hv, mt.unit, mt.dpi) : (+data.h || 638);
        sc = new fabric.StaticCanvas(null, { width: realW, height: realH, enableRetinaScaling: false });
        await new Promise((res, rej) => { try { sc.loadFromJSON(fab, res); } catch (err) { rej(err); } });
        if (okMeta && mt.transparent) sc.backgroundColor = ""; // 匯出透明底 was on
        else if (okMeta && /^#[0-9a-f]{6}$/i.test(mt.bgColor || "")) sc.backgroundColor = mt.bgColor;
        sc.renderAll();
        const svg = sc.toSVG(okMeta ? { width: toCm(mt.wv, mt.unit, mt.dpi) + "cm", height: toCm(mt.hv, mt.unit, mt.dpi) + "cm", viewBox: { x: 0, y: 0, width: realW, height: realH } } : undefined);
        await ctx.placeSvg(svg);
        return { objects: sc.getObjects().length };
      } finally { if (sc) sc.dispose(); }
    },
  };
  return ctx;
}
