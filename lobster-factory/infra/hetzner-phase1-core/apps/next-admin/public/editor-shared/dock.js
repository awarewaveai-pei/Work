// Craft 編輯器專業版共用 dock 外殼（R0-PLAN 2026-11-05-photocraft-pro §6 C4.1；向量版、畫布版共用，不複製）。
// 門頁（components/tools/ProEditorFrame.tsx）提供空的 <aside id="<編輯器>-dock"> 與 window.__proEditor = { editor, frame }；
// 各編輯器的 public/<編輯器>-dock/dock.js 只給清單、尺寸、轉接器，呼叫 mountDock。
// 版面（操作者 2026-11-05「右側兩欄應該做成同一欄」）：只有一條圖示欄，點圖示 → 該面板以浮出層打開（全高、蓋在 iframe
// 右側之上，不推擠 iframe）；再點同圖示、點頁面其他地方或 Esc 收起；一次只開一個。外觀 = 同目錄 dock.css；
// 面板 = /editor-shared/blocks/<id>.js，介面 export default { id, title, icon, mount(ctx, body) }，單一面板載入或掛載失敗只影響它自己。
// 尺寸只存在各編輯器 dock.js 的 sizes：這裡寫成 root 上的 --vp-*，dock.css 只用 var()。

/** 面板模組所在（搬路徑只改這一處）。 */
export const BLOCKS_BASE = "/editor-shared/blocks/";

/** sizes 必填鍵 → root 上的 CSS 變數（px）。rail 圖示欄寬、button 圖示格、panel 浮出層預設寬（panelMin–panelMax 可拉）、
 *  tab 分頁高、pad 內距。 */
export const SIZE_VARS = Object.freeze({
  rail: "--vp-rail",
  button: "--vp-button",
  panel: "--vp-panel",
  panelMin: "--vp-panel-min",
  panelMax: "--vp-panel-max",
  tab: "--vp-tab",
  pad: "--vp-pad",
});

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

function checkSizes(sizes) {
  const bad = Object.keys(SIZE_VARS).filter((k) => !(Number.isFinite(sizes?.[k]) && sizes[k] > 0));
  if (bad.length) throw new Error(`mountDock：sizes 缺少或不是正數：${bad.join("、")}`);
}

/**
 * @param {HTMLElement} root 門頁的空 <aside>
 * @param {{ makeCtx: (opts: object) => object, panelIds: readonly string[], storeKey: string,
 *   sizes: { rail: number, button: number, panel: number, panelMin: number, panelMax: number, tab: number, pad: number } }} opts
 * @returns {Promise<{ ctx: object, panels: object[], show: (p: object) => void, close: () => void }>}
 */
export async function mountDock(root, { makeCtx, panelIds, storeKey, sizes }) {
  checkSizes(sizes);
  const tag = `[${globalThis.__proEditor?.editor || "pro"} dock]`;
  const css = el("link");
  css.rel = "stylesheet";
  css.href = new URL("./dock.css", import.meta.url).href;
  document.head.appendChild(css);

  root.textContent = "";
  root.classList.add("vp-root");
  for (const [k, v] of Object.entries(SIZE_VARS)) root.style.setProperty(v, `${sizes[k]}px`);
  const icons = el("div", "vp-icons");
  // 浮出層：固定在圖示欄左側、全高；面板 body 都掛在裡面，切換只換顯示，狀態保留
  const flyout = el("div", "card vp-flyout");
  flyout.hidden = true;
  const resize = el("div", "vp-resize");
  const tabs = el("div", "tab-bar vp-tabs");
  const tab = el("div", "tab tab--active vp-tab");
  tabs.appendChild(tab);
  const bodies = el("div", "vp-bodies");
  const status = el("div", "vp-status");
  status.setAttribute("role", "status");
  flyout.append(resize, tabs, bodies, status);
  root.append(icons, flyout);

  const clamp = (w) => Math.min(sizes.panelMax, Math.max(sizes.panelMin, w));
  let width = sizes.panel;
  try {
    const w = JSON.parse(localStorage.getItem(storeKey) || "{}")?.width;
    if (Number.isFinite(w)) width = clamp(w);
  } catch {}
  const place = () => {
    flyout.style.width = `${width}px`;
    flyout.style.right = `${root.getBoundingClientRect().width}px`;
  };

  // frame 明確傳（轉接器不自己找全域）；ctx.info／ctx.busy：面板的狀態訊息與忙碌顯示在浮出層底部
  const ctx = makeCtx({
    frame: () => globalThis.__proEditor?.frame,
    onInfo: (msg) => {
      status.textContent = String(msg ?? "").replace(/<[^>]*>/g, "");
    },
    onBusy: (on) => flyout.classList.toggle("vp-busy", !!on),
  });

  // 左緣拉寬（panelMin–panelMax）
  resize.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    resize.classList.add("vp-active");
    resize.setPointerCapture(e.pointerId);
    const move = (m) => {
      width = Math.round(clamp(startW + (startX - m.clientX)));
      place();
    };
    const up = () => {
      resize.classList.remove("vp-active");
      resize.removeEventListener("pointermove", move);
      for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) resize.removeEventListener(t, up);
      try {
        localStorage.setItem(storeKey, JSON.stringify({ width }));
      } catch {}
    };
    resize.addEventListener("pointermove", move);
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) resize.addEventListener(t, up);
  });

  // 面板模組：全部並行載入（要標題與圖示），掛載延到第一次打開。
  const settled = await Promise.allSettled(panelIds.map((id) => import(`${BLOCKS_BASE}${id}.js`)));
  const panels = panelIds.map((id, i) => {
    const r = settled[i];
    const mod = r.status === "fulfilled" ? r.value?.default : null;
    if (!mod || typeof mod.mount !== "function") {
      console.warn(`${tag} 面板 ${id} 載入失敗`, r.status === "rejected" ? r.reason : "沒有 default.mount");
    }
    return { id, mod: mod && typeof mod.mount === "function" ? mod : null, title: mod?.title || id, icon: mod?.icon || "▢", body: null, button: null };
  });

  const showError = (body, err) => {
    console.error(tag, err);
    body.appendChild(el("div", "vp-error", `面板出錯：${err?.message || err}`));
  };
  const mountInto = (p) => {
    p.body = el("div", "vp-body");
    p.body.dataset.panel = p.id;
    bodies.appendChild(p.body);
    if (!p.mod) {
      p.body.appendChild(el("div", "vp-error", "此面板載入失敗，其他面板不受影響。"));
      return;
    }
    try {
      const r = p.mod.mount(ctx, p.body);
      if (r && typeof r.catch === "function") r.catch((err) => showError(p.body, err));
    } catch (err) {
      showError(p.body, err);
    }
  };

  let open = null;
  let noticeShown = false; // 浮出層只顯示一則訊息（沒有面板開著），例如帶入的設計開不起來
  const close = () => {
    if (noticeShown) {
      noticeShown = false;
      flyout.hidden = true;
    }
    if (!open) return;
    open.button.classList.remove("tab--active");
    open.body.hidden = true;
    flyout.hidden = true;
    open = null;
  };
  const show = (p) => {
    const same = open === p;
    close();
    if (same) return;
    if (!p.body) mountInto(p);
    for (const b of bodies.children) b.hidden = b !== p.body;
    tab.textContent = p.title;
    status.textContent = "";
    flyout.hidden = false;
    place();
    p.button.classList.add("tab--active");
    open = p;
  };
  for (const p of panels) {
    const b = el("button", "tab vp-icon", p.icon);
    b.type = "button";
    b.title = p.title;
    b.dataset.panelIcon = p.id;
    b.setAttribute("aria-label", p.title);
    b.addEventListener("click", () => show(p));
    p.button = b;
    icons.appendChild(b);
  }
  // 點頁面其他地方（不在浮出層、不在圖示欄）收起；iframe 裡的點擊不會傳到這頁，畫布操作不會關掉面板
  document.addEventListener("pointerdown", (e) => {
    if ((open || noticeShown) && !flyout.contains(e.target) && !icons.contains(e.target)) close();
  });
  /** 沒開面板時也看得到的訊息：浮出層只放標題與狀態列。 */
  const notice = (title, msg) => {
    close();
    for (const b of bodies.children) b.hidden = true;
    tab.textContent = title;
    status.textContent = String(msg ?? "");
    flyout.hidden = false;
    place();
    noticeShown = true;
  };
  document.addEventListener("keydown", (e) => e.key === "Escape" && close());
  window.addEventListener("resize", () => open && place());

  // C8.1：交接帶「傳回」票、且開成功 → 圖示欄頂端多一顆「傳回 <label>」（可重複按：改了再傳）
  openHandoff(ctx, (msg) => notice("帶入設計", msg), tag).then((h) => {
    if (!h?.ret) return;
    const title = `傳回 ${h.ret.label}`;
    const b = el("button", "btn btn-primary vp-icon vp-return", "↩");
    b.type = "button";
    b.title = title;
    b.dataset.return = h.ret.id;
    b.setAttribute("aria-label", title);
    b.addEventListener("click", async () => {
      b.disabled = true;
      ctx.busy?.(true);
      try {
        await sendBack(ctx, h.ret, (msg) => notice(title, msg));
      } finally {
        ctx.busy?.(false);
        b.disabled = false;
      }
    });
    icons.prepend(b);
  });
  return { ctx, panels, show, close };
}

/** C8.1 傳回：等原分頁 ack 的時間；過了就當原分頁不在，改存 My Designs。 */
export const RETURN_ACK_MS = 2000;
/** 頻道名 = components/tools/canvas-handoff.ts CANVAS_RETURN_CHANNEL。 */
export const RETURN_CHANNEL = "canvas-return";

const blobToDataUrl = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });

/** 送出 {type:"return", id, image} 並等 {type:"ack", id}；ackMs 內沒有（或沒有 BroadcastChannel）→ false。 */
export function postReturn(id, image, ackMs = RETURN_ACK_MS) {
  if (typeof BroadcastChannel === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    const ch = new BroadcastChannel(RETURN_CHANNEL);
    const finish = (ok) => { clearTimeout(timer); ch.close(); resolve(ok); };
    const timer = setTimeout(() => finish(false), ackMs);
    ch.onmessage = (e) => { if (e.data?.type === "ack" && e.data.id === id) finish(true); };
    ch.postMessage({ type: "return", id, image });
  });
}

/**
 * C8.1 不變量：按「傳回」後圖一定落地一處——原分頁那一格收下（ack），或存進 My Designs。
 * 匯出整張 PNG → postReturn → 沒 ack 就 save(ctx, png)（= blocks/my-designs.js saveToMyDesigns，與面板同一個）。
 * report(msg) 顯示結果；回 "returned" | "saved" | "failed"。
 * @param {{ exportArtboard: (o: object) => Promise<Blob> }} ctx
 * @param {{ id: string, label: string }} ret
 * @param {(msg: string) => void} [report]
 * @param {{ ackMs?: number, save?: (ctx: object, png: Blob) => Promise<{ ok: boolean, message?: string }> }} [opts]
 */
export async function sendBack(ctx, ret, report, { ackMs = RETURN_ACK_MS, save } = {}) {
  try {
    report?.("傳回中…");
    const png = await ctx.exportArtboard({ format: "png" });
    if (await postReturn(ret.id, await blobToDataUrl(png), ackMs)) {
      report?.(`✅ 已傳回 ${ret.label}`);
      return "returned";
    }
    report?.("原分頁沒有回應，存進我的設計中…");
    const saveFn = save ?? (await import(`${BLOCKS_BASE}my-designs.js`)).saveToMyDesigns;
    const r = await saveFn(ctx, png);
    if (r?.ok) {
      report?.("原分頁已關，已存進我的設計");
      return "saved";
    }
    report?.(`原分頁已關，存進我的設計失敗：${r?.message || "未知原因"}。請用「My Designs」面板或匯出另存。`);
    return "failed";
  } catch (err) {
    console.error("[pro dock] 傳回失敗", err);
    report?.(`❌ 傳回失敗：${err?.message || err}`);
    return "failed";
  }
}

/** C7.1：別的工具送來的設計（門頁的 __proEditor.handoff，canvas-handoff.ts openInCanvas）——編輯器就緒後開成文件，
 *  開成功才 done() 清掉交接並回傳交接（C8.1 帶 ret 時 dock 加「傳回」鈕）；失敗（編輯器逾時、下載失敗、開檔失敗）交接留著，
 *  重新整理會再試，並用 report 顯示訊息、回 null。 */
export async function openHandoff(ctx, report, tag = "[pro dock]") {
  try {
    const h = await globalThis.__proEditor?.handoff;
    if (!h) return null;
    await ctx.ready();
    const r = await fetch(h.url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await ctx.openFile(await r.blob(), h.name);
    h.done?.();
    return h;
  } catch (err) {
    console.error(tag, "帶入的設計開不起來", err);
    report?.(`❌ 帶入的設計開不起來：${err?.message || err}。重新整理頁面會再試一次。`);
    return null;
  }
}

/** 頁面就緒後把 dock 掛進 #rootId 一次（重複載入同一 script 不重掛）；掛好後以 mountDock 的結果呼叫 then。 */
export function autoMount(rootId, opts, then) {
  if (typeof document === "undefined") return;
  const start = () => {
    const root = document.getElementById(rootId);
    if (!root || root.dataset.mounted) return;
    root.dataset.mounted = "1";
    mountDock(root, opts)
      .then((dock) => then?.(dock))
      .catch((err) => console.error(`[${rootId}]`, err));
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
