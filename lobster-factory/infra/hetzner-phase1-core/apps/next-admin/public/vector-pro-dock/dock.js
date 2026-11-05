// 向量（專業版）dock：門頁提供空的 <aside id="vector-pro-dock"> 與 window.__vectorProFrame（VectorCraft iframe），
// 本模組自己掛載。版面（操作者 2026-11-05「右側兩欄應該做成同一欄」）：只有一條圖示欄（寬 38，同真品 icon rail），
// 點圖示 → 該面板以浮出層打開（寬 310、全高、蓋在 iframe 右側之上，不推擠 iframe）；再點同圖示、點頁面其他地方
// 或 Esc 收起；一次只開一個。外觀 = theme.css（同目錄）；面板 = /editor-shared/blocks/<id>.js，
// 介面 export default { id, title, icon, mount(ctx, body) }，單一面板載入或掛載失敗只影響它自己。
// 尺寸：真品 crates/ui-egui/src/panel_docking.rs:36-43（圖示欄 38、面板 310，220–720）、:1216-1226（分頁 33）。

import { createVectorcraftCtx } from "/editor-shared/ctx-vectorcraft.js";

/** 面板模組所在（搬路徑只改這一處）。 */
export const BLOCKS_BASE = "/editor-shared/blocks/";

/** 十個我們獨有的面板，圖示欄由上而下的順序（R0-PLAN §6 C4.2）。 */
export const PANEL_IDS = Object.freeze([
  "templates",
  "fonts",
  "color-grade",
  "bg-remove",
  "webp",
  "my-designs",
  "qr",
  "barcode",
  "mockup",
  "batch-export",
]);

const PANEL_WIDTH = 310;
const PANEL_MIN = 220;
const PANEL_MAX = 720;
const STORE = "vector-pro-dock:v2";
const LEGACY_KEYS = ["vector-pro-dock:v1", "vector-pro-dock:brightness-applied:v1"]; // 舊版欄位狀態與明暗旗標

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

function loadWidth() {
  try {
    const w = JSON.parse(localStorage.getItem(STORE) || "{}")?.width;
    return Number.isFinite(w) ? Math.min(PANEL_MAX, Math.max(PANEL_MIN, w)) : PANEL_WIDTH;
  } catch {
    return PANEL_WIDTH;
  }
}

/** C5.1：第一次開啟切到 Essentials Classic（控制列開；真品 crates/ui-egui/src/workspaces.rs:85-91），
 *  之後尊重使用者自己的選擇。Window › Workspace 選單項 = UI 指令 window.workspace {name}
 *  （control.rs:262 ui.menu.invoke 吃 {command, params}，不是選單路徑）。 */
export const DEFAULT_WORKSPACE = "Essentials Classic";
const WORKSPACE_FLAG = "vector-pro-dock:workspace-default:v1";

export async function applyDefaultWorkspace(ctx) {
  try {
    if (localStorage.getItem(WORKSPACE_FLAG)) return;
    await ctx.ready();
    const api = globalThis.__vectorProFrame?.contentWindow?.vectorcraft;
    if ((await api.inspect())?.ui?.workspace !== DEFAULT_WORKSPACE) {
      await api.request("ui.menu.invoke", { command: "window.workspace", params: { name: DEFAULT_WORKSPACE } });
    }
    localStorage.setItem(WORKSPACE_FLAG, "1");
  } catch (err) {
    console.warn("[vector-pro dock] 預設工作區未套用", err);
  }
}

export async function mountDock(root, makeCtx = createVectorcraftCtx) {
  for (const k of LEGACY_KEYS) {
    try {
      localStorage.removeItem(k);
    } catch {}
  }
  const css = el("link");
  css.rel = "stylesheet";
  css.href = new URL("./theme.css", import.meta.url).href;
  document.head.appendChild(css);

  root.textContent = "";
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

  let width = loadWidth();
  const place = () => {
    flyout.style.width = `${width}px`;
    flyout.style.right = `${root.getBoundingClientRect().width}px`;
  };

  // ctx.info／ctx.busy：面板的狀態訊息與忙碌顯示在浮出層底部
  const ctx = makeCtx({
    onInfo: (msg) => {
      status.textContent = String(msg ?? "").replace(/<[^>]*>/g, "");
    },
    onBusy: (on) => flyout.classList.toggle("vp-busy", !!on),
  });

  // 左緣拉寬（220–720）
  resize.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    resize.classList.add("vp-active");
    resize.setPointerCapture(e.pointerId);
    const move = (m) => {
      width = Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, startW + (startX - m.clientX))));
      place();
    };
    const up = () => {
      resize.classList.remove("vp-active");
      resize.removeEventListener("pointermove", move);
      for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) resize.removeEventListener(t, up);
      try {
        localStorage.setItem(STORE, JSON.stringify({ width }));
      } catch {}
    };
    resize.addEventListener("pointermove", move);
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) resize.addEventListener(t, up);
  });

  // 面板模組：全部並行載入（要標題與圖示），掛載延到第一次打開。
  const settled = await Promise.allSettled(PANEL_IDS.map((id) => import(`${BLOCKS_BASE}${id}.js`)));
  const panels = PANEL_IDS.map((id, i) => {
    const r = settled[i];
    const mod = r.status === "fulfilled" ? r.value?.default : null;
    if (!mod || typeof mod.mount !== "function") {
      console.warn(`[vector-pro dock] 面板 ${id} 載入失敗`, r.status === "rejected" ? r.reason : "沒有 default.mount");
    }
    return { id, mod: mod && typeof mod.mount === "function" ? mod : null, title: mod?.title || id, icon: mod?.icon || "▢", body: null, button: null };
  });

  const showError = (body, err) => {
    console.error("[vector-pro dock]", err);
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
  const close = () => {
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
    b.setAttribute("aria-label", p.title);
    b.addEventListener("click", () => show(p));
    p.button = b;
    icons.appendChild(b);
  }
  // 點頁面其他地方（不在浮出層、不在圖示欄）收起；iframe 裡的點擊不會傳到這頁，畫布操作不會關掉面板
  document.addEventListener("pointerdown", (e) => {
    if (open && !flyout.contains(e.target) && !icons.contains(e.target)) close();
  });
  document.addEventListener("keydown", (e) => e.key === "Escape" && close());
  window.addEventListener("resize", () => open && place());

  applyDefaultWorkspace(ctx);
  return { ctx, panels, show, close };
}

if (typeof document !== "undefined") {
  const start = () => {
    const root = document.getElementById("vector-pro-dock");
    if (root && !root.dataset.mounted) {
      root.dataset.mounted = "1";
      mountDock(root).catch((err) => console.error("[vector-pro dock]", err));
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
