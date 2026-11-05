// 向量（專業版）第二 dock 欄：門頁提供空的 <aside id="vector-pro-dock"> 與 window.__vectorProFrame（VectorCraft iframe），
// 本模組自己掛載。外觀 = theme.css（同目錄，跟著本檔走，不寫路徑常數）；面板 = /editor-shared/blocks/<id>.js，
// 介面 export default { id, title, icon, mount(ctx, body) }，單一面板載入或掛載失敗只影響它自己。
// 欄寬 310（220–720）、收成 38 圖示欄、分頁 33：真品 crates/ui-egui/src/panel_docking.rs:36-43、:1216-1226。

import { createVectorcraftCtx } from "/editor-shared/ctx-vectorcraft.js";

/** 面板模組所在（搬路徑只改這一處）。 */
export const BLOCKS_BASE = "/editor-shared/blocks/";

/** 十個我們獨有的面板，欄內由上而下的順序（R0-PLAN §6 C4.2）。 */
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

const COLUMN_WIDTH = 310;
const COLUMN_MIN = 220;
const COLUMN_MAX = 720;
const STORE = "vector-pro-dock:v1";


const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

function loadState() {
  let s = {};
  try {
    s = JSON.parse(localStorage.getItem(STORE) || "{}") || {};
  } catch {}
  return {
    width: Number.isFinite(s.width) ? s.width : COLUMN_WIDTH,
    collapsed: s.collapsed === true,
    open: Array.isArray(s.open) ? s.open.filter((id) => PANEL_IDS.includes(id)) : [PANEL_IDS[0]],
  };
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

/** VectorCraft 本體明暗跟 app 主題：--body-bg 亮 → Light，暗 → MediumDark（真品 theme.rs:9-33 Brightness id；
 *  ui.set {brightness} = control.rs:638 → window.brightness）。只在使用者沒在 VectorCraft 自己改過時套用：
 *  記下我們上次套的值，現值不同 = 使用者選過，從此不碰。 */
const BRIGHTNESS_FLAG = "vector-pro-dock:brightness-applied:v1";

export function themeIsLight(doc = document) {
  const probe = doc.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;background:var(--body-bg)";
  doc.body.appendChild(probe);
  const m = getComputedStyle(probe).backgroundColor.match(/[\d.]+/g) || [];
  probe.remove();
  const [r, g, b, a = 1] = m.map(Number);
  if (![r, g, b].every(Number.isFinite) || a === 0) return null; // 沒有 --body-bg（透明）= 不判斷
  return 0.2126 * r + 0.7152 * g + 0.0722 * b >= 128;
}

export async function followThemeBrightness(ctx) {
  try {
    const light = themeIsLight();
    if (light === null) return;
    const want = light ? "light" : "mediumDark";
    await ctx.ready();
    const api = globalThis.__vectorProFrame?.contentWindow?.vectorcraft;
    const raw = String((await api.inspect())?.ui?.brightness ?? ""); // 序列化為變體名 "MediumDark"
    const cur = raw.charAt(0).toLowerCase() + raw.slice(1);
    const applied = localStorage.getItem(BRIGHTNESS_FLAG);
    if (applied && applied !== cur) return; // 使用者自己選過
    if (cur !== want) await api.request("ui.set", { brightness: want });
    localStorage.setItem(BRIGHTNESS_FLAG, want);
  } catch (err) {
    console.warn("[vector-pro dock] VectorCraft 明暗未套用", err);
  }
}

export async function mountDock(root, ctx = createVectorcraftCtx()) {
  const state = loadState();
  const save = () => {
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
    } catch {}
  };

  const css = el("link");
  css.rel = "stylesheet";
  css.href = new URL("./theme.css", import.meta.url).href;
  document.head.appendChild(css);

  root.textContent = "";
  root.style.width = `${Math.min(COLUMN_MAX, Math.max(COLUMN_MIN, state.width))}px`;
  root.classList.toggle("vp-collapsed", state.collapsed);

  const head = el("div", "vp-head");
  const collapse = el("button", "vp-collapse");
  collapse.type = "button";
  const resize = el("div", "vp-resize");
  const groups = el("div", "vp-groups");
  const icons = el("div", "vp-icons");
  head.appendChild(collapse);
  root.append(resize, head, groups, icons);

  const setCollapsed = (on) => {
    state.collapsed = on;
    root.classList.toggle("vp-collapsed", on);
    root.style.width = on ? "" : `${state.width}px`;
    collapse.textContent = on ? "«" : "»";
    collapse.title = on ? "展開面板" : "收合為圖示";
    closeFlyout();
    save();
  };
  collapse.addEventListener("click", () => setCollapsed(!state.collapsed));

  // 左緣拉寬（220–720）
  resize.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = root.getBoundingClientRect().width;
    resize.classList.add("vp-active");
    resize.setPointerCapture(e.pointerId);
    const move = (m) => {
      state.width = Math.round(Math.min(COLUMN_MAX, Math.max(COLUMN_MIN, startW + (startX - m.clientX))));
      root.style.width = `${state.width}px`;
    };
    const up = () => {
      resize.classList.remove("vp-active");
      resize.removeEventListener("pointermove", move);
      for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) resize.removeEventListener(t, up);
      save();
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
    return { id, mod: mod && typeof mod.mount === "function" ? mod : null, title: mod?.title || id, icon: mod?.icon || "▢", body: null };
  });

  const mountInto = (p, body) => {
    if (!p.mod) {
      body.appendChild(el("div", "vp-error", "此面板載入失敗，其他面板不受影響。"));
      return;
    }
    try {
      const r = p.mod.mount(ctx, body);
      if (r && typeof r.catch === "function") r.catch((err) => showError(body, err));
    } catch (err) {
      showError(body, err);
    }
  };
  const showError = (body, err) => {
    console.error("[vector-pro dock]", err);
    body.appendChild(el("div", "vp-error", `面板出錯：${err?.message || err}`));
  };

  // 展開狀態：每個面板一個群組（分頁列 33 + 內容）
  for (const p of panels) {
    const group = el("section", "vp-group");
    group.dataset.panel = p.id;
    const tabs = el("div", "tab-bar vp-tabs");
    const tab = el("button", "tab vp-tab");
    tab.type = "button";
    tab.append(el("span", null, p.icon), el("span", null, p.title));
    tabs.appendChild(tab);
    const body = el("div", "vp-body");
    group.append(tabs, body);
    groups.appendChild(group);
    const setOpen = (on) => {
      group.classList.toggle("vp-open", on);
      tab.classList.toggle("tab--active", on);
      if (on && !p.body) {
        p.body = body;
        mountInto(p, body);
      }
    };
    tab.addEventListener("click", () => {
      const on = !group.classList.contains("vp-open");
      state.open = on ? [...new Set([...state.open, p.id])] : state.open.filter((x) => x !== p.id);
      setOpen(on);
      save();
    });
    setOpen(state.open.includes(p.id));
  }

  // 收合狀態：38 圖示欄，點圖示在欄左側飛出該面板（與展開狀態共用同一個掛載好的 body）
  let flyout = null;
  function closeFlyout() {
    if (!flyout) return;
    flyout.home.appendChild(flyout.panel.body); // home = 群組 section，body 回到分頁列下方
    flyout.box.remove();
    flyout.button.classList.remove("tab--active");
    flyout = null;
  }
  for (const p of panels) {
    const b = el("button", "tab vp-icon", p.icon);
    b.type = "button";
    b.title = p.title;
    icons.appendChild(b);
    b.addEventListener("click", () => {
      const same = flyout?.panel === p;
      closeFlyout();
      if (same) return;
      const group = groups.querySelector(`[data-panel="${p.id}"]`);
      const home = group; // .vp-body 的原父節點
      if (!p.body) {
        p.body = group.querySelector(".vp-body");
        mountInto(p, p.body);
      }
      const box = el("div", "card vp-flyout");
      const tabs = el("div", "tab-bar vp-tabs");
      const tab = el("div", "tab tab--active vp-tab", p.title);
      tabs.appendChild(tab);
      box.append(tabs, p.body);
      root.appendChild(box);
      const r = root.getBoundingClientRect();
      box.style.top = `${Math.max(0, Math.min(b.getBoundingClientRect().top, window.innerHeight - box.offsetHeight - 8))}px`;
      box.style.right = `${window.innerWidth - r.left}px`;
      b.classList.add("tab--active");
      flyout = { panel: p, box, home, button: b };
    });
  }
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeFlyout());
  window.addEventListener("resize", () => closeFlyout());

  setCollapsed(state.collapsed);

  followThemeBrightness(ctx);
  applyDefaultWorkspace(ctx);

  return { ctx, panels };
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
