// ctx 契約（ctx-contract.md）對真品 PhotoCraft 的實作：iframe 的 window.photocraft（控制通道）＋ ?host=parent 訊息
// （photocraft:open 進、photocraft:save 出；scripts/photocraft-pro/web-host-api.patch）。每個方法的指令序列與 undo 步數
// 在 ctx-contract.md「PhotoCraft 指令序列」（實測 2026-11-06）。網頁版沒有路徑型存檔：bytes 一律經「選單 → 存檔對話框 →
// photocraft:save」，所以一次只跑一個方法（queue），存檔以副檔名配給等待者；暫用文件以內容命名（避開開著的文件名），關檔前以名字找回。
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

/** SVG 字體 → PhotoCraft 字體（網站字型庫 photo-pro fonts/manifest.txt 有的家族）。具名字體照給，沒有就由 PhotoCraft 換預設。 */
const GENERIC_FONT = { monospace: "JetBrains Mono", "ui-monospace": "JetBrains Mono", "sans-serif": "Inter", "system-ui": "Inter", "ui-sans-serif": "Inter", serif: "PT Serif", "ui-serif": "PT Serif" };
/** 算好的 fill（瀏覽器回 rgb 函式字串，0–255，可帶 alpha）× fill-opacity → type.create 的 [r,g,b,a]：**0–1 浮點**
 *  （給 0–255 會被夾成 1＝白字，實測 2026-11-06）。漸層 url(#…) 等讀不出 → 黑。資料色，不是介面色。 */
export function cssColorRgba(c, fillOpacity = 1) {
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?/i.exec(String(c || ""));
  const k = Number.isFinite(+fillOpacity) ? Math.max(0, Math.min(1, +fillOpacity)) : 1;
  if (!m) return [0, 0, 0, k];
  const a = m[4] === undefined ? 1 : Math.max(0, Math.min(1, m[5] ? +m[4] / 100 : +m[4]));
  return [+m[1], +m[2], +m[3]].map((v) => Math.max(0, Math.min(255, v)) / 255).concat(a * k);
}

/**
 * SVG 的 <text> 拆出來：PhotoCraft 網頁版匯入 SVG 時沒有字型可排文字（usvg 字型庫是空的，PC crates/io/src/svg.rs:126-136），
 * 文字被丟掉並跳「needs a font」通知（同檔 :1006）。所以在瀏覽器量每段文字（文件像素座標＝SVG 視窗座標、字級、對齊、顏色、字體），
 * 從 SVG 拿掉，回 { svg（無文字）, texts }，之後在暫用文件用 type.create 建成文字圖層（向量、可編輯，字型由網站供）。
 * 限制：每段取第一個 x/y、tspan 攤平成一行、旋轉／斜切不帶過去。沒有 <text> → 原樣。
 */
export function splitSvgText(svg) {
  if (!/<text[\s>]/i.test(svg) || typeof DOMParser === "undefined") return { svg, texts: [] };
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = parsed.documentElement;
  if (root?.localName !== "svg") return { svg, texts: [] }; // 解析失敗：交給 PhotoCraft 回報
  const live = document.importNode(root, true);
  // 沒寫寬高（或寫 %）時 PhotoCraft 以 viewBox 為畫布；瀏覽器預設 300×150：量之前補成一樣
  const vb = (root.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  for (const [k, i] of [["width", 2], ["height", 3]]) {
    const v = root.getAttribute(k);
    if ((!v || /%$/.test(v)) && vb.length === 4 && vb[i] > 0) live.setAttribute(k, String(vb[i]));
  }
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;left:-100000px;top:0;opacity:0;pointer-events:none"; // 不用 visibility：會被文字繼承
  box.appendChild(live);
  document.body.appendChild(box);
  const texts = [];
  try {
    const originals = [...root.getElementsByTagNameNS("*", "text")];
    [...live.getElementsByTagNameNS("*", "text")].forEach((t, i) => {
      originals[i]?.remove();
      const text = (t.textContent || "").replace(/\s+/g, " ").trim();
      const cs = getComputedStyle(t);
      const m = t.getCTM?.();
      if (!text || !m || cs.display === "none" || cs.visibility === "hidden" || cs.fill === "none") return;
      const first = (list) => (list?.baseVal?.numberOfItems ? list.baseVal.getItem(0).value : 0);
      const x = first(t.x), y = first(t.y);
      const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
      const family = String(cs.fontFamily || "").split(",")[0].trim().replace(/^["']|["']$/g, "");
      texts.push({
        text,
        x: m.a * x + m.c * y + m.e,
        y: m.b * x + m.d * y + m.f,
        px: (parseFloat(cs.fontSize) || 16) * scale,
        align: { middle: "center", end: "right" }[cs.textAnchor] || "left",
        color: cssColorRgba(cs.fill, cs.fillOpacity * groupOpacity(t)),
        font: GENERIC_FONT[family.toLowerCase()] || family || "Inter",
        weight: Math.min(900, Math.max(100, parseInt(cs.fontWeight, 10) || 400)),
        italic: cs.fontStyle === "italic" || cs.fontStyle === "oblique",
      });
    });
  } finally {
    box.remove();
  }
  return { svg: new XMLSerializer().serializeToString(root), texts };
}

/** 畫出來的透明度 = fill 的 alpha × fill-opacity × 自己與每個祖先的 opacity（opacity 不繼承，要一路乘上去）。 */
function groupOpacity(el) {
  let k = 1;
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const o = parseFloat(getComputedStyle(n).opacity);
    if (Number.isFinite(o)) k *= Math.max(0, Math.min(1, o));
    if (n.localName === "svg" && !(n.parentElement && n.parentElement.closest?.("svg"))) break;
  }
  return k;
}

/** 圖層 PNG（修剪後範圍 bounds）貼進框 frame 的透明畫布：回框大小的 PNG。框＝bounds 時原樣回。 */
async function padToFrame(png, bounds, frame) {
  if (bounds[0] === frame[0] && bounds[1] === frame[1] && bounds[2] === frame[2] && bounds[3] === frame[3]) return png;
  const bmp = await createImageBitmap(png);
  const c = new OffscreenCanvas(frame[2], frame[3]);
  c.getContext("2d").drawImage(bmp, bounds[0] - frame[0], bounds[1] - frame[1]);
  return c.convertToBlob({ type: "image/png" });
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
  /** 暫用文件的名字使用者看得到（開的那一下的分頁、狀態列「已開啟 …」），所以用內容自己的名字（例「條碼.svg」），
   *  取的時候避開所有開著的文件名（重名加「 (2)」…）。關之前以名字找回 index（使用者在 iframe 裡開／關分頁也不會關錯）：
   *  找不到就不關；同名不只一份（使用者中途開了同名檔）→ 不關、報錯，不猜。 */
  async function tempName(api, base, ext) {
    const names = new Set((await session(api)).documents.map((d) => d.name));
    const e = ext ? `.${ext}` : "";
    let name = `${base}${e}`;
    for (let i = 2; names.has(name); i++) name = `${base} (${i})${e}`;
    return name;
  }
  async function indexOf(api, name) {
    const hits = (await session(api)).documents.map((d, i) => [d.name, i]).filter(([n]) => n === name);
    if (hits.length > 1) throw new Error(`有 ${hits.length} 份「${name}」，分不出哪一份是暫用文件，沒有關閉`);
    return hits.length ? hits[0][1] : -1;
  }
  /** 使用者的文件：記 {index, name}，每次用之前重新找回（使用者可能在 iframe 裡開／關分頁，index 會位移）。
   *  原 index 名字對得上就用它，否則找唯一同名的；找不到或不唯一 → 中止，不猜。 */
  const targetRef = async (api) => {
    const s = await session(api);
    return { index: s.active, name: s.documents[s.active]?.name };
  };
  async function resolveTarget(api, ref) {
    const docs = (await session(api)).documents;
    if (docs[ref.index]?.name === ref.name) return ref.index;
    const same = docs.map((d, i) => [d.name, i]).filter(([n]) => n === ref.name);
    if (same.length === 1) return (ref.index = same[0][1]);
    throw new Error(`原本的文件「${ref.name}」已關閉或分頁變動，操作中止`);
  }

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
  /** 在暫用文件（名字 temp）上做 fn，不論成敗都關掉它（不存）並回到使用者的文件 ref。
   *  fn 失敗 → 拋 fn 的錯（清理的錯只記 console）；fn 成功但清理失敗 → 拋清理的錯：暫用文件還開著／還是作用中時
   *  不能回報成功，否則下一個操作會落在暫用文件上。 */
  async function withTemp(api, temp, ref, fn) {
    let result, error, failed = false;
    try {
      result = await fn();
    } catch (err) {
      failed = true;
      error = err;
    }
    try {
      const i = await indexOf(api, temp);
      if (i >= 0) {
        await ex(api, "file.close", { document: i, save: "discard" });
        if (i < ref.index && (await session(api)).documents[ref.index - 1]?.name === ref.name) ref.index -= 1;
      }
      await ex(api, "document.activate", { document: await resolveTarget(api, ref) });
    } catch (err) {
      if (!failed) throw new Error(`暫用文件 ${temp} 沒有正確關閉：${err?.message || err}`);
      console.warn("[photocraft ctx] 關閉暫用文件失敗", err);
    }
    if (failed) throw error;
    return result;
  }
  /** 剛開的文件（作用中）整理成「一個」頂層圖層：texts 建成文字圖層（splitSvgText），頂層多於一個就全部收進名為 name 的群組。
   *  SVG 匯入把每個形狀拆成一個頂層 Shape 圖層（條碼＝底＋每一條），copyToDocument 只複製選取的圖層（PC crates/engine/src/cmd/
   *  layer_copy_cmds.rs:162）：不收成一個，置入就只剩一條。只動暫用文件，使用者的文件 0 步。 */
  async function asOneLayer(api, texts, name) {
    if (texts.length) {
      const res = (await doc(api)).resolution || 72;
      for (const t of texts) {
        await ex(api, "type.create", { x: t.x, y: t.y, text: t.text, size: Math.min(1296, Math.max(0.1, (t.px * 72) / res)), /* type.create 的範圍 0.1–1296 pt */ font: t.font, weight: t.weight, italic: t.italic, align: t.align, color: t.color, name: t.text });
      }
    }
    const top = ((await ex(api, "layer.list", { flat: true })).layers || []).filter((l) => l.parent == null);
    if (top.length > 1) {
      await ex(api, "select.allLayers", {});
      await ex(api, "layer.groupLayers", { name });
    }
  }
  /** 開一份暫用文件（名＝layerName.ext），整理成一個圖層，複製到使用者的文件，關掉暫用文件；回 {ids}（一個）。
   *  沒有文件時這張圖直接成為文件。texts：SVG 拆出的文字（點陣圖給 []）。place：copyToDocument 的位置參數，或在暫用文件
   *  裡算出它的函式（placeImage 的 at）。回 {ids, offset（新圖 (0,0) 落點）}。 */
  async function placeFrom(api, blob, ext, layerName, place, texts) {
    const s = await session(api);
    if (!s.documents.length) {
      const name = `${layerName}.${ext}`;
      await open(api, blob, name);
      try {
        await asOneLayer(api, texts, layerName);
      } catch (err) {
        // 整理到一半的文件不留給使用者（它就是這次置入的結果）：關掉再報錯
        const i = await indexOf(api, name).catch(() => -1);
        if (i >= 0) await ex(api, "file.close", { document: i, save: "discard" }).catch(() => {});
        throw err;
      }
      return { ids: ((await ex(api, "layer.list", {})).layers || []).map((l) => l.id) };
    }
    const ref = await targetRef(api);
    const temp = await tempName(api, layerName, ext);
    await open(api, blob, temp);
    const r = await withTemp(api, temp, ref, async () => {
      await asOneLayer(api, texts, layerName);
      const where = typeof place === "function" ? await place() : place;
      return ex(api, "layer.copyToDocument", { document: await resolveTarget(api, ref), ...where, name: layerName });
    });
    return { ids: r.layers, offset: r.offset };
  }
  /** 暫用文件（已是作用中）裁成 rect → Quick Export PNG（存檔名 = 文件名.png）。 */
  async function cropAndExport(api, [x, y, width, height]) {
    await ex(api, "image.crop", { x, y, width, height });
    return (await savedBy(["png"], () => invoke(api, "file.export.quickExportAsPng"))).blob;
  }
  /** 圖片框：PhotoCraft 的圖層 bounds 只算不透明像素（透明邊被修掉）。replaceImage 換進來的圖記下它的完整框
   *  {frame, trimmed}，key = 文件名#圖層 id；之後 selectedImage／selectionMask／replaceImage 都以這個框為準，換多次不縮放、
   *  不漂移。圖層被使用者移動（修剪範圍同大小）→ 框跟著平移；大小變了（變形、塗到透明邊）→ 回到 bounds。 */
  const frames = new Map();
  const frameKey = (ref, id) => `${ref.name}#${id}`;
  function frameOf(ref, l) {
    const rec = frames.get(frameKey(ref, l.id));
    const b = l.bounds;
    if (!rec || !b || rec.trimmed[2] !== b[2] || rec.trimmed[3] !== b[3]) return b;
    const dx = b[0] - rec.trimmed[0], dy = b[1] - rec.trimmed[1];
    return [rec.frame[0] + dx, rec.frame[1] + dy, rec.frame[2], rec.frame[3]];
  }
  const baseName = (name, fallback) => String(name || fallback).replace(/\.[^.]+$/, "") || fallback;
  const extFor = (name, blob, fallback) => (name && /\.[a-z0-9]+$/i.test(name) ? extOf(name) : EXT[blob.type] || fallback);

  const ctx = {
    host: PHOTOCRAFT_HOST,
    info: (msg) => opts.onInfo?.(String(msg ?? "")),
    busy: (on) => opts.onBusy?.(!!on),
    ready: () => pc().then(() => true),

    /** SVG 置入成向量圖層，置中、為作用中圖層：一個形狀＝一個 Shape 圖層；多個形狀或有文字＝一個群組（Shape 圖層＋文字圖層，
     *  見 splitSvgText／asOneLayer）。1 個 undo 步。 */
    placeSvg: op((api, svg, name = "awarewave.svg") => {
      const { svg: shapes, texts } = splitSvgText(String(svg));
      return placeFrom(api, new Blob([shapes], { type: "image/svg+xml" }), "svg", baseName(name, "awarewave"), { center: true }, texts).then((r) => ({ ids: r.ids }));
    }),

    /** 點陣圖置入成新圖層，原像素大小；預設置中，1 個 undo 步。選用 o.at = [x, y]：圖片（整張、含透明邊）左上角落在文件像素
     *  (x, y)：照 replaceImage，以暫用文件裡的修剪範圍 tb 算 copyToDocument 的 at（它對齊修剪範圍中心），回傳 offset 不等於
     *  (x, y) 才整數平移（2 步）；並記下完整框，之後 selectedImage 讀回含透明邊的整張。沒有文件時這張圖就是文件，at 不用。 */
    placeImage: op(async (api, blob, name, o = {}) => {
      const layerName = baseName(name, "awarewave");
      const at = Array.isArray(o?.at) && o.at.length === 2 && o.at.every(Number.isFinite) ? o.at.map(Math.round) : null;
      if (!at || !(await session(api)).documents.length) return { ids: (await placeFrom(api, blob, extFor(name, blob, "png"), layerName, { center: true }, [])).ids };
      const [x, y] = at;
      let size;
      const r = await placeFrom(api, blob, extFor(name, blob, "png"), layerName, async () => {
        const d = await doc(api);
        size = [d.width, d.height];
        const tb = ((await ex(api, "layer.list", { flat: true })).layers || [])[0]?.bounds || [0, 0, d.width, d.height];
        return { at: [x + tb[0] + tb[2] / 2, y + tb[1] + tb[3] / 2] };
      }, []);
      const nid = r.ids[0];
      if (r.offset && (r.offset[0] !== x || r.offset[1] !== y)) await ex(api, "layer.translate", { layer: nid, dx: x - r.offset[0], dy: y - r.offset[1] });
      const ref = await targetRef(api);
      const placed = ((await ex(api, "layer.list", { flat: true })).layers || []).find((l) => l.id === nid);
      if (placed?.bounds) frames.set(frameKey(ref, nid), { frame: [x, y, size[0], size[1]], trimmed: placed.bounds });
      return { ids: r.ids };
    }),

    /** 作用中的像素圖層 → {id, blob（圖片框 PNG）, transform [1,0,0,1,x,y], width, height}；非像素圖層或沒文件 → null。
     *  圖片框＝replaceImage 換進來的完整框（含透明邊），其餘＝圖層 bounds。原文件 0 步。
     *  不開暫用文件：圖層 › 快速轉存為 PNG（只出這個圖層的修剪範圍）再由瀏覽器貼進圖片框。轉存的尺寸≠修剪範圍（圖層樣式
     *  外擴等）→ 退回「複製圖層成新文件 → 裁成框 → 轉存」。多選圖層時也走退回：快速轉存會每個選取圖層各出一張 PNG
     *  （實測 2026-11-06），多的那幾張沒人等、會被當成使用者的匯出下載；不改使用者的圖層選取。 */
    selectedImage: op(async (api) => {
      if (!(await session(api)).documents.length) return null;
      const ls = (await ex(api, "layer.list", { flat: true })).layers || [];
      const l = ls.find((x) => x.active) || null;
      if (!l || l.kind !== "Pixel" || !l.bounds) return null;
      const ref = await targetRef(api);
      const box = frameOf(ref, l);
      const [x, y, width, height] = box;
      let own = null;
      if (ls.filter((x) => x.selected).length <= 1) {
        own = (await savedBy(["png"], () => invoke(api, "layer.quickExportAsPng"))).blob;
        const bmp = await createImageBitmap(own);
        if (bmp.width !== l.bounds[2] || bmp.height !== l.bounds[3]) own = null;
        bmp.close?.();
      }
      let blob;
      if (own) blob = await padToFrame(own, l.bounds, box);
      else {
        const temp = await tempName(api, baseName(l.name, "layer"));
        await ex(api, "layer.duplicate", { layer: l.id, document: "new", documentName: temp });
        blob = await withTemp(api, temp, ref, () => cropAndExport(api, box));
      }
      return { id: l.id, blob, transform: [1, 0, 0, 1, x, y], width, height };
    }),

    /** 圖層 id 換成新像素：新圖整張（含透明邊）對齊舊圖層的圖片框（frameOf），堆疊位置、名稱不變；尺寸不同才等比例縮進框。
     *  新圖層＋刪舊圖層，2 個 undo 步（縮放 3）。換多次不累積縮放、不漂移。
     *  限制：舊圖層的圖層樣式、遮色片、混合模式不帶過去。中途失敗會撤掉新圖層，舊圖層不動。回 {id: 新圖層}。 */
    replaceImage: op(async (api, id, blob) => {
      const ref = await targetRef(api);
      const old = ((await ex(api, "layer.list", { flat: true })).layers || []).find((l) => l.id === id);
      if (!old?.bounds) throw new Error(`找不到圖層 ${id}`);
      const [x, y, w, h] = frameOf(ref, old);
      await ex(api, "layer.select", { layer: id }); // 新圖層插在作用中圖層之上
      const temp = await tempName(api, baseName(old.name, "layer"), EXT[blob.type] || "png");
      await open(api, blob, temp);
      let size, tb;
      const r = await withTemp(api, temp, ref, async () => {
        // copyToDocument 的 at 對齊「修剪後」範圍的中心（實測 2026-11-06）：以暫用文件裡的修剪範圍 tb 算 at，
        // 新圖的 (0,0) 就落在框的左上角；回傳的 offset 即 (0,0) 落點。
        const d = await doc(api);
        size = [d.width, d.height];
        tb = ((await ex(api, "layer.list", { flat: true })).layers || [])[0]?.bounds || [0, 0, d.width, d.height];
        return ex(api, "layer.copyToDocument", { document: await resolveTarget(api, ref), at: [x + tb[0] + tb[2] / 2, y + tb[1] + tb[3] / 2], name: old.name });
      });
      const nid = r.layers[0];
      try {
        if (size[0] !== w || size[1] !== h) {
          // edit.transform 把圖層「修剪後」範圍映到 quad：把 tb 依「整張 → 框」的比例換算
          const sx = w / size[0], sy = h / size[1];
          const [qx, qy, qw, qh] = [x + tb[0] * sx, y + tb[1] * sy, tb[2] * sx, tb[3] * sy];
          await ex(api, "edit.transform", { layer: nid, quad: [[qx, qy], [qx + qw, qy], [qx + qw, qy + qh], [qx, qy + qh]] });
        } else if (r.offset && (r.offset[0] !== x || r.offset[1] !== y)) {
          await ex(api, "layer.translate", { layer: nid, dx: x - r.offset[0], dy: y - r.offset[1] });
        }
        await ex(api, "layer.delete", { layer: id });
      } catch (err) {
        await ex(api, "layer.delete", { layer: nid }).catch(() => {});
        throw err;
      }
      frames.delete(frameKey(ref, id));
      const placed = ((await ex(api, "layer.list", { flat: true })).layers || []).find((l) => l.id === nid);
      if (placed?.bounds) frames.set(frameKey(ref, nid), { frame: [x, y, w, h], trimmed: placed.bounds });
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
      const ref = await targetRef(api);
      const frameRect = (l && frameOf(ref, l)) || [0, 0, d.width, d.height];
      const temp = await tempName(api, "選取範圍");
      await ex(api, "image.duplicate", { name: temp });
      return withTemp(api, temp, ref, async () => {
        await ex(api, "layer.new.layer", { name: "mask" });
        await ex(api, "edit.fill", { contents: "white" });
        await ex(api, "select.inverse", {});
        await ex(api, "edit.fill", { contents: "black" });
        await ex(api, "select.deselect", {});
        return cropAndExport(api, frameRect);
      });
    }),

    /** 選用：選取的圖層（多選＝合成一塊，同舊編輯器 CanvasEditor.tsx:1059）等比縮放、置中到畫布；'fit' 完整放進、'fill' 蓋滿。
     *  沒有選取的圖層 → 作用中圖層。一次 edit.transform（layers＋rect＝合併範圍），1 個 undo 步。回 {id: 作用中圖層, ids}。 */
    fitLayer: op(async (api, mode = "fit") => {
      const ls = (await ex(api, "layer.list", { flat: true })).layers || [];
      const byId = new Map(ls.map((l) => [l.id, l]));
      const inSelected = (l) => { for (let p = byId.get(l.parent); p; p = byId.get(p.parent)) if (p.selected) return true; return false; };
      const active = ls.find((l) => l.active);
      let pick = ls.filter((l) => l.selected && l.bounds && !inSelected(l));
      if (!pick.length && active?.bounds) pick = [active];
      if (!pick.length) throw new Error("沒有選取的圖層");
      const x0 = Math.min(...pick.map((l) => l.bounds[0])), y0 = Math.min(...pick.map((l) => l.bounds[1]));
      const x1 = Math.max(...pick.map((l) => l.bounds[0] + l.bounds[2])), y1 = Math.max(...pick.map((l) => l.bounds[1] + l.bounds[3]));
      const d = await doc(api);
      const ids = pick.map((l) => l.id);
      await ex(api, "edit.transform", { layers: ids, rect: [x0, y0, x1, y1], quad: fitQuad([x0, y0, x1 - x0, y1 - y0], d.width, d.height, mode) });
      return { id: active?.id ?? ids[0], ids };
    }),
  };
  return ctx;
}
