// ctx 契約（ctx-contract.md）對真品 PhotoCraft 的實作：iframe 的 window.photocraft（控制通道）＋ ?host=parent 訊息
// （photocraft:open 進、photocraft:save 出；scripts/photocraft-pro/web-host-api.patch）。每個方法的指令序列與 undo 步數
// 在 ctx-contract.md「PhotoCraft 指令序列」（實測 2026-11-06）。網頁版沒有路徑型存檔：bytes 一律經「選單 → 存檔對話框 →
// photocraft:save」，所以一次只跑一個方法（queue），存檔以副檔名配給等待者；暫用文件取唯一名字，關檔前以名字找回。
// 測試：lib/studio/__tests__/photo-pro-dock.test.ts（mock photocraft＋postMessage，每個方法一條）。

const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", psd: "image/vnd.adobe.photoshop" };
const FORMAT = { png: "png", jpg: "jpg", jpeg: "jpg", webp: "webp" };
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 宿主描述（契約 host；值見 ctx-contract.md 表）。網頁版存不出 .pcraft（PC crates/ui-egui/src/app/files.rs:236-245），原始檔 = PSD。 */
export const PHOTOCRAFT_HOST = Object.freeze({
  id: "photocraft",
  label: "畫布",
  sourceExt: ".psd",
  sourceName: "design.psd",
  saveTag: Object.freeze({ source: "canvas", modelName: "canvas", prompt: "canvas edit" }),
  listSources: Object.freeze(["canvas"]),
});

/** 匯出品質 → Export As 的 1–100 整數；0–1 視為比例。 */
export function toQuality(q) {
  const n = Number(q);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(Math.min(100, Math.max(1, n <= 1 ? n * 100 : n)));
}

/** 長度 → 像素。點陣文件沒有「實體尺寸」以外的單位：mm／cm／in／pt 以 dpi 換算。 */
const PER_INCH = { in: 1, mm: 1 / 25.4, cm: 1 / 2.54, pt: 1 / 72 };
export function toPixels(value, unit = "px", dpi = 72) {
  const v = Number(value);
  const d = Number(dpi) > 0 ? Number(dpi) : 72;
  const px = unit === "px" ? v : v * (PER_INCH[unit] ?? NaN) * d;
  if (!(px > 0) || !Number.isFinite(px)) throw new Error(`尺寸不正確：${value} ${unit}`);
  return Math.max(1, Math.round(px));
}

/** 符合／填滿畫布：等比、置中的目標四角（edit.transform quad）。 */
export function fitQuad([x0, y0, w0, h0], W, H, mode) {
  if (!(w0 > 0 && h0 > 0)) throw new Error("作用中圖層是空的");
  const s = (mode === "fill" ? Math.max : Math.min)(W / w0, H / h0);
  const w = w0 * s, h = h0 * s, x = (W - w) / 2, y = (H - h) / 2;
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

/** 匯出縮放：ppi 相對於文件解析度，點陣圖不放大（上限 100%）。 */
export function scaleFor(ppi, docPpi) {
  const p = Number(ppi), d = Number(docPpi) > 0 ? Number(docPpi) : 72;
  if (!(p > 0)) return 100;
  return Math.max(1, Math.min(100, Math.round((p / d) * 1000) / 10));
}

async function imageSize(blob) {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bmp = await createImageBitmap(blob);
    const s = [bmp.width, bmp.height];
    bmp.close?.();
    return s;
  } catch {
    return null;
  }
}

/** 不透明底色：透明 PNG 疊在底色上，再以瀏覽器編碼成要的格式（PhotoCraft 的 Export As 只有「透明／攤平成白」）。 */
async function onBackground(png, color, type, quality) {
  const bmp = await createImageBitmap(png);
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext("2d");
  g.fillStyle = color; // white／black／#rrggbb：canvas 直接吃（資料色，由呼叫端給）
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0);
  return c.convertToBlob({ type, quality: quality === undefined ? undefined : quality / 100 });
}

/**
 * @param {{frame: () => (HTMLIFrameElement|undefined), timeoutMs?: number, saveTimeoutMs?: number, pollMs?: number,
 *          onInfo?: (msg: string) => void, onBusy?: (on: boolean) => void, download?: (blob: Blob, name: string) => void}} opts
 *   frame（必填）：回傳宿主 iframe（dock 外殼傳 window.__proEditor.frame）。download：面板沒在等的存檔（使用者按原生
 *   另存／匯出）交給父頁下載；預設 <a download>。
 */
export function createPhotocraftCtx(opts) {
  const frame = opts?.frame;
  if (typeof frame !== "function") throw new Error("createPhotocraftCtx 需要 opts.frame（回傳宿主 iframe 的函式）");
  const timeoutMs = opts.timeoutMs ?? 60000;
  const saveTimeoutMs = opts.saveTimeoutMs ?? 60000;
  const pollMs = opts.pollMs ?? 200;
  const download = opts.download ?? ((blob, name) => {
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 10000);
  });
  let queue = Promise.resolve();
  let failed = null; // photocraft:failed（無 WebGPU／WebGL2）
  let seq = 0;
  /** 等存檔的方法。photocraft:save 沒有 id，所以以副檔名配：交給第一個「這種檔我在等」的等待者；
   *  沒人在等這種檔（使用者按原生 另存／匯出，或等待者已逾時）→ 父頁下載，bytes 不丟。 */
  const waiters = [];
  const extOf = (name) => String(name).split(".").pop().toLowerCase();

  const win = () => frame()?.contentWindow;
  if (typeof window !== "undefined") {
    window.addEventListener("message", (e) => {
      const w = win();
      if (!w || e.source !== w || e.origin !== window.location.origin) return;
      const m = e.data || {};
      if (m.type === "photocraft:failed" && !m.id) failed = String(m.error || "PhotoCraft 無法啟動");
      if (m.type !== "photocraft:save" || !m.bytes) return;
      const name = String(m.name || "photocraft");
      const blob = new Blob([m.bytes], { type: MIME[extOf(name)] || "application/octet-stream" });
      const i = waiters.findIndex((x) => x.exts.includes(extOf(name)));
      if (i < 0) return download(blob, name);
      const [hit] = waiters.splice(i, 1);
      clearTimeout(hit.timer);
      hit.resolve({ blob, name });
    });
  }
  /** 先登記等待者再觸發存檔（觸發可能同步就送出訊息）；觸發失敗即撤回登記，不讓它吃掉下一筆存檔。 */
  async function savedBy(exts, trigger) {
    let entry;
    const got = new Promise((resolve, reject) => {
      entry = { exts, resolve, reject };
      entry.timer = setTimeout(() => {
        drop(entry);
        reject(new Error("存檔逾時：PhotoCraft 沒有交回檔案（若稍後才到，會直接下載到電腦，不會遺失）"));
      }, saveTimeoutMs);
    });
    waiters.push(entry);
    try {
      await trigger();
    } catch (err) {
      clearTimeout(entry.timer);
      drop(entry);
      got.catch(() => {});
      throw err;
    }
    return got;
  }
  const drop = (entry) => {
    const i = waiters.indexOf(entry);
    if (i >= 0) waiters.splice(i, 1);
  };

  async function pc() {
    const end = Date.now() + timeoutMs;
    for (;;) {
      if (failed) throw new Error(failed);
      const api = win()?.photocraft;
      if (api) return api;
      if (Date.now() >= end) throw new Error("PhotoCraft 尚未載入（window.photocraft 不存在）");
      await sleep(pollMs);
    }
  }

  const op = (fn) => (...args) => {
    const run = queue.then(async () => fn(await pc(), ...args));
    queue = run.catch(() => {});
    return run;
  };

  const ex = (api, c, p = {}) => api.execute(c, p);
  const invoke = (api, id) => api.request("ui.menu.invoke", { id });
  const session = async (api) => (await api.request("ui.inspect", {})).session;
  const doc = (api) => ex(api, "document.inspect", {});
  const activeLayer = async (api) => {
    const { layers } = await ex(api, "layer.list", { flat: true });
    return (layers || []).find((l) => l.active) || null;
  };
  /** 暫用文件一律取唯一名字：關之前以名字找回它的 index（使用者在 iframe 裡開／關分頁也不會關錯），找不到就不關。 */
  const tempName = (ext) => `awarewave-tmp-${Date.now().toString(36)}-${++seq}${ext ? `.${ext}` : ""}`;
  const indexOf = async (api, name) => (await session(api)).documents.findIndex((d) => d.name === name);

  /** 交給 PhotoCraft 開成新文件（photocraft:open，同 File › Open）；等「這個名字的文件多一份」，回它的 index。 */
  async function open(api, blob, name) {
    const count = (s) => s.documents.filter((d) => d.name === name).length;
    const before = count(await session(api));
    const bytes = await blob.arrayBuffer();
    win().postMessage({ type: "photocraft:open", name, bytes }, window.location.origin, [bytes]);
    const end = Date.now() + timeoutMs;
    for (;;) {
      const s = await session(api);
      if (count(s) > before) {
        const all = s.documents.map((d, i) => [d.name, i]).filter(([n]) => n === name);
        return all[all.length - 1][1];
      }
      if (Date.now() >= end) throw new Error(`PhotoCraft 沒有開啟 ${name}`);
      await sleep(pollMs);
    }
  }
  /** 在暫用文件（名字 temp）上做 fn，不論成敗都關掉它（不存）並回到使用者的文件 targetName／target。
   *  關檔的錯不蓋掉 fn 的錯。 */
  async function withTemp(api, temp, target, fn) {
    try {
      return await fn();
    } finally {
      try {
        const i = await indexOf(api, temp);
        if (i >= 0) {
          await ex(api, "file.close", { document: i, save: "discard" });
          await ex(api, "document.activate", { document: i < target ? target - 1 : target });
        } else {
          console.warn(`[photocraft ctx] 找不到暫用文件 ${temp}，沒有關閉任何文件`);
        }
      } catch (err) {
        console.warn("[photocraft ctx] 關閉暫用文件失敗", err);
      }
    }
  }
  /** 開一份暫用文件，把它的圖層複製到 target，關掉暫用文件；回新圖層 ids。layerName 是新圖層名。 */
  async function placeFrom(api, blob, ext, layerName, place) {
    const s = await session(api);
    if (!s.documents.length) {
      await open(api, blob, `${layerName}.${ext}`); // 沒有文件：這張圖就是文件
      return { ids: ((await ex(api, "layer.list", {})).layers || []).map((l) => l.id) };
    }
    const target = s.active;
    const temp = tempName(ext);
    await open(api, blob, temp);
    const r = await withTemp(api, temp, target, () => ex(api, "layer.copyToDocument", { document: target, ...place, name: layerName }));
    return { ids: r.layers };
  }
  /** 暫用文件（已是作用中）裁成 rect → Quick Export PNG（存檔名 = 文件名.png）。 */
  async function cropAndExport(api, [x, y, width, height]) {
    await ex(api, "image.crop", { x, y, width, height });
    return (await savedBy(["png"], () => invoke(api, "file.export.quickExportAsPng"))).blob;
  }
  const baseName = (name, fallback) => String(name || fallback).replace(/\.[^.]+$/, "") || fallback;
  const extFor = (name, blob, fallback) => (name && /\.[a-z0-9]+$/i.test(name) ? extOf(name) : EXT[blob.type] || fallback);

  const ctx = {
    host: PHOTOCRAFT_HOST,
    info: (msg) => opts.onInfo?.(String(msg ?? "")),
    busy: (on) => opts.onBusy?.(!!on),
    ready: () => pc().then(() => true),

    /** SVG 置入成 Shape 圖層（向量），置中、為作用中圖層。1 個 undo 步。 */
    placeSvg: op((api, svg, name = "awarewave.svg") =>
      placeFrom(api, new Blob([svg], { type: "image/svg+xml" }), "svg", baseName(name, "awarewave"), { center: true })),

    /** 點陣圖置入成新圖層，原像素大小、置中。1 個 undo 步。 */
    placeImage: op((api, blob, name) => placeFrom(api, blob, extFor(name, blob, "png"), baseName(name, "awarewave"), { center: true })),

    /** 作用中的像素圖層 → {id, blob（圖層範圍 PNG）, transform [1,0,0,1,x,y], width, height}；非像素圖層或沒文件 → null。原文件 0 步。 */
    selectedImage: op(async (api) => {
      if (!(await session(api)).documents.length) return null;
      const l = await activeLayer(api);
      if (!l || l.kind !== "Pixel" || !l.bounds) return null;
      const target = (await session(api)).active;
      const temp = tempName();
      await ex(api, "layer.duplicate", { layer: l.id, document: "new", documentName: temp });
      const blob = await withTemp(api, temp, target, () => cropAndExport(api, l.bounds));
      const [x, y, width, height] = l.bounds;
      return { id: l.id, blob, transform: [1, 0, 0, 1, x, y], width, height };
    }),

    /** 圖層 id 換成新像素：堆疊位置、中心、大小、名稱不變（新圖層＋刪舊圖層；尺寸不同再縮回舊框）。2–3 個 undo 步。
     *  限制：舊圖層的圖層樣式、遮色片、混合模式不帶過去。中途失敗會撤掉新圖層，舊圖層不動。回 {id: 新圖層}。 */
    replaceImage: op(async (api, id, blob) => {
      const target = (await session(api)).active;
      const old = ((await ex(api, "layer.list", { flat: true })).layers || []).find((l) => l.id === id);
      if (!old?.bounds) throw new Error(`找不到圖層 ${id}`);
      const [x, y, w, h] = old.bounds;
      await ex(api, "layer.select", { layer: id }); // 新圖層插在作用中圖層之上
      const size = await imageSize(blob);
      const temp = tempName(EXT[blob.type] || "png");
      await open(api, blob, temp);
      const r = await withTemp(api, temp, target, () => ex(api, "layer.copyToDocument", { document: target, at: [x + w / 2, y + h / 2], name: old.name }));
      const nid = r.layers[0];
      try {
        if (size && (size[0] !== w || size[1] !== h)) {
          await ex(api, "edit.transform", { layer: nid, quad: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] });
        }
        await ex(api, "layer.delete", { layer: id });
      } catch (err) {
        await ex(api, "layer.delete", { layer: nid }).catch(() => {});
        throw err;
      }
      return { id: nid };
    }),

    /** 新文件分頁開檔（PSD／PNG／JPEG／WebP／SVG…，photocraft:open）；回 true。 */
    openFile: op(async (api, blob, name) => {
      if (!name) throw new Error("openFile 需要檔名（副檔名決定格式）");
      await open(api, blob, name);
      return true;
    }),

    /** 整張 → Blob：Export As 對話框（format、縮放、品質、透明）。ppi 相對文件解析度、不放大；width/height = 指定像素。
     *  background 不透明時先出透明 PNG，再由瀏覽器疊底色、編碼。artboard 忽略（點陣文件只有一張畫布）。0 個 undo 步。 */
    exportArtboard: op(async (api, o = {}) => {
      const format = FORMAT[String(o.format || "png").toLowerCase()];
      if (!format) throw new Error(`不支援的匯出格式：${o.format}`);
      const opaque = o.background && o.background !== "transparent";
      const fileFormat = opaque ? "png" : format;
      const q = toQuality(o.quality);
      const d = await doc(api);
      const { dialog } = await invoke(api, "file.export.exportAs");
      const set = (field, value) => api.request("ui.dialog.set", { dialog, field, value });
      const cancel = () => api.request("ui.dialog.cancel", { dialog }).catch(() => {});
      try {
        await set("format", fileFormat);
        if (o.width !== undefined || o.height !== undefined) {
          await set("sizing", "pixels");
          await set("lockAspect", false);
          await set("width", toPixels(o.width ?? d.width));
          await set("height", toPixels(o.height ?? d.height));
        } else {
          await set("sizing", "scale");
          await set("scale", scaleFor(o.ppi, d.resolution));
        }
        await set("transparency", true);
        if (!opaque && format === "webp") await set("lossless", q === undefined);
        if (!opaque && q !== undefined && format !== "png") await set("quality", q);
      } catch (err) {
        await cancel();
        throw err;
      }
      const exts = fileFormat === "jpg" ? ["jpg", "jpeg"] : [fileFormat];
      const { blob } = await savedBy(exts, async () => {
        try {
          await api.request("ui.dialog.confirm", { dialog });
        } catch (err) {
          await cancel();
          throw err;
        }
      });
      return opaque ? onBackground(blob, o.background, MIME[format], q) : blob;
    }),

    /** 畫布尺寸（Image › Canvas Size，置中延伸）；沒有文件就 file.new。unit mm／cm／in／pt／px（以 dpi 換算）。1 個 undo 步。 */
    setArtboardSize: op(async (api, { width, height, unit = "px", dpi = 72 } = {}) => {
      const w = toPixels(width, unit, dpi), h = toPixels(height, unit, dpi);
      if (!(await session(api)).documents.length) {
        await ex(api, "file.new", { width: w, height: h, mode: "rgb", depth: 8, background: "white" });
        return { width: w, height: h, created: true };
      }
      await ex(api, "image.canvasSize", { width: w, height: h, units: "px", anchor: "center" });
      return { width: w, height: h, created: false };
    }),

    /** 目前文件存成分層原始檔 → PSD Blob（File › Save a Copy；不改文件自己的名字）。0 個 undo 步。 */
    saveAs: op(async (api) => (await savedBy(["psd"], () => invoke(api, "file.saveACopy"))).blob),

    /** 選用：目前選取 → 遮罩 PNG（白 = 選取、黑 = 其餘，不透明），框 = 作用中圖層的範圍（同 selectedImage 的 blob）；
     *  沒有選取 → null。在 image.duplicate 的副本上做，原文件 0 步、選取保留。快速遮色片照 PhotoCraft（= Photoshop）規則，見契約。 */
    selectionMask: op(async (api) => {
      const d = await doc(api).catch(() => null);
      if (!d?.hasSelection) return null;
      const l = await activeLayer(api);
      const frameRect = l?.bounds || [0, 0, d.width, d.height];
      const target = (await session(api)).active;
      const temp = tempName();
      await ex(api, "image.duplicate", { name: temp });
      return withTemp(api, temp, target, async () => {
        await ex(api, "layer.new.layer", { name: "mask" });
        await ex(api, "edit.fill", { contents: "white" });
        await ex(api, "select.inverse", {});
        await ex(api, "edit.fill", { contents: "black" });
        await ex(api, "select.deselect", {});
        return cropAndExport(api, frameRect);
      });
    }),

    /** 選用：作用中圖層等比縮放、置中到畫布；'fit' 完整放進、'fill' 蓋滿。1 個 undo 步。 */
    fitLayer: op(async (api, mode = "fit") => {
      const l = await activeLayer(api);
      if (!l?.bounds) throw new Error("沒有作用中的圖層");
      const d = await doc(api);
      await ex(api, "edit.transform", { layer: l.id, quad: fitQuad(l.bounds, d.width, d.height, mode) });
      return { id: l.id };
    }),
  };
  return ctx;
}
