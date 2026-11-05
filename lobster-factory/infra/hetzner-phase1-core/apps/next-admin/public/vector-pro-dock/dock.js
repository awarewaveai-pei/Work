// 向量（專業版）dock：清單、尺寸、預設工作區。外殼（圖示欄＋浮出面板、樣式）= /editor-shared/dock.js＋dock.css，
// 與畫布專業版共用（R0-PLAN 2026-11-05-photocraft-pro §6 C4.1）。門頁 = components/tools/ProEditorFrame.tsx。

import { autoMount } from "/editor-shared/dock.js";
import { createVectorcraftCtx } from "/editor-shared/ctx-vectorcraft.js";

/** 九個我們獨有的面板，圖示欄由上而下的順序（R0-PLAN §6 C4.2；字型面板 2026-11-05 取消，改用 VectorCraft 原生字型庫）。 */
export const PANEL_IDS = Object.freeze([
  "templates",
  "color-grade",
  "bg-remove",
  "webp",
  "my-designs",
  "qr",
  "barcode",
  "mockup",
  "batch-export",
]);

/** 尺寸照真品 storytold/vectorcraft crates/ui-egui/src/panel_docking.rs:36-43（面板 310，可拉 220–720，圖示欄 38）、
 *  dock_style() :1216-1226（分頁高 33）；圖示格 30 = craft-ui icon_size 20 + 10；內距 10（向量版 R0-PLAN C4.1）。 */
export const SIZES = Object.freeze({ rail: 38, button: 30, panel: 310, panelMin: 220, panelMax: 720, tab: 33, pad: 10 });

const STORE = "vector-pro-dock:v2";
const LEGACY_KEYS = ["vector-pro-dock:v1", "vector-pro-dock:brightness-applied:v1"]; // 舊版欄位狀態與明暗旗標

/** C5.1：第一次開啟切到 Essentials Classic（控制列開；真品 crates/ui-egui/src/workspaces.rs:85-91），
 *  之後尊重使用者自己的選擇。Window › Workspace 選單項 = UI 指令 window.workspace {name}
 *  （control.rs:262 ui.menu.invoke 吃 {command, params}，不是選單路徑）。 */
export const DEFAULT_WORKSPACE = "Essentials Classic";
const WORKSPACE_FLAG = "vector-pro-dock:workspace-default:v1";

export async function applyDefaultWorkspace(ctx) {
  try {
    if (localStorage.getItem(WORKSPACE_FLAG)) return;
    await ctx.ready();
    const api = globalThis.__proEditor?.frame?.contentWindow?.vectorcraft;
    if ((await api.inspect())?.ui?.workspace !== DEFAULT_WORKSPACE) {
      await api.request("ui.menu.invoke", { command: "window.workspace", params: { name: DEFAULT_WORKSPACE } });
    }
    localStorage.setItem(WORKSPACE_FLAG, "1");
  } catch (err) {
    console.warn("[vector-pro dock] 預設工作區未套用", err);
  }
}

if (typeof document !== "undefined") {
  for (const k of LEGACY_KEYS) {
    try {
      localStorage.removeItem(k);
    } catch {}
  }
  autoMount(
    "vector-pro-dock",
    { makeCtx: createVectorcraftCtx, panelIds: PANEL_IDS, storeKey: STORE, sizes: SIZES },
    ({ ctx }) => applyDefaultWorkspace(ctx),
  );
}
