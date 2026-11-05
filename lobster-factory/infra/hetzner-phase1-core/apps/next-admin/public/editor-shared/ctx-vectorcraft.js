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

/**
 * @param {{frame?: () => (HTMLIFrameElement|undefined), timeoutMs?: number, pollMs?: number}} [opts]
 *   frame：回傳宿主 iframe（預設 window.__vectorProFrame，門頁 page.tsx 提供）。
 */
export function createVectorcraftCtx(opts = {}) {
  const frame = opts.frame || (() => globalThis.__vectorProFrame);
  const timeoutMs = opts.timeoutMs ?? 30000;
  const pollMs = opts.pollMs ?? 200;
  let running = 0;
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

  /** 每個對外方法包一層：busy 計數。 */
  const op = (fn) => (...args) => {
    running++;
    const run = queue.then(async () => fn(await vc(), ...args));
    queue = run.catch(() => {});
    return run.finally(() => running--);
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
    info: { host: "vectorcraft", contract: 1 },
    get busy() {
      return running > 0;
    },
    ready: () => vc().then(() => true),

    /** 置入 SVG 字串，置中於視窗並選取；回 {ids}。 */
    placeSvg: op((api, svg, name = "awarewave.svg") => place(api, name, new Blob([svg], { type: "image/svg+xml" }))),

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
      for (const k of ["ppi", "background", "quality", "artboard", "width", "height"]) if (o[k] !== undefined) params[k] = o[k];
      const r = await api.request("app.export", params);
      return base64ToBlob(r.dataBase64, MIME[format] || "application/octet-stream");
    }),

    /** 字型檔 bytes 加進字型庫（需 C1.4 的 vectorcraft.addFont 補丁）。 */
    addFont: op(async (api, bytes) => {
      if (typeof api.addFont !== "function") throw new Error("addFont 不可用：此 VectorCraft 建置沒有 C1.4 字型補丁");
      return api.addFont(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
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
  };
  return ctx;
}
