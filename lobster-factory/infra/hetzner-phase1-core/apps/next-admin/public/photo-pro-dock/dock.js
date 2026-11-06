// 畫布（專業版）dock：清單、尺寸、首次語言。外殼（圖示欄＋浮出面板、樣式）= /editor-shared/dock.js＋dock.css，
// 與向量專業版共用（R0-PLAN 2026-11-05-photocraft-pro §6 C4.2）。門頁 = components/tools/ProEditorFrame.tsx。

import { autoMount } from "/editor-shared/dock.js";
import { createPhotocraftCtx } from "/editor-shared/ctx-photocraft.js";

/** 我們獨有、PhotoCraft 沒有的面板，圖示欄由上而下（R0-PLAN §6 C4 面板清單；對照依據：研究報告 §3）。 */
export const PANEL_IDS = Object.freeze([
  "templates",
  "color-grade",
  "bg-remove",
  "ai-fill",
  "genfx",
  "edge-mask",
  "webp",
  "my-designs",
  "qr",
  "barcode",
  "mockup",
  "batch-export",
]);

/** 尺寸照 PhotoCraft Pro 版型（PC crates/ui-egui/src/panels/dock.rs:37,73；panels/panel_docking.rs:89-91,561；
 *  widgets/panel.rs:53）：圖示欄 36、鈕 28、面板 290（可拉 250–720）、分頁高 28、內距 8。 */
export const SIZES = Object.freeze({ rail: 36, button: 28, panel: 290, panelMin: 250, panelMax: 720, tab: 28, pad: 8 });

const STORE = "photo-pro-dock:v1";

/** 第一次開啟把介面切成繁中（control-protocol：prefs.set interface.language），之後尊重使用者在偏好設定的選擇。 */
export const DEFAULT_LANGUAGE = "zh-hant";
const LANGUAGE_FLAG = "photo-pro-dock:language-default:v1";

export async function applyDefaultLanguage(ctx) {
  try {
    if (localStorage.getItem(LANGUAGE_FLAG)) return;
    await ctx.ready();
    const api = globalThis.__proEditor?.frame?.contentWindow?.photocraft;
    await api.execute("prefs.set", { path: "interface.language", value: DEFAULT_LANGUAGE });
    localStorage.setItem(LANGUAGE_FLAG, "1");
  } catch (err) {
    console.warn("[photo-pro dock] 預設語言未套用", err);
  }
}

if (typeof document !== "undefined") {
  autoMount(
    "photo-pro-dock",
    { makeCtx: createPhotocraftCtx, panelIds: PANEL_IDS, storeKey: STORE, sizes: SIZES },
    ({ ctx }) => applyDefaultLanguage(ctx),
  );
}
