// 繁中 labels and badge classes (globals.css .badge-*) for /ops/systems.
import type { FeatureStatus, SystemType } from "./contract";
import type { EffectiveStatus } from "./overview";
import type { Priority, SystemStatus } from "./projection";

export const TYPE_LABEL: Record<SystemType, string> = {
  product: "產品", internal: "內部工具", infrastructure: "基礎設施", governance: "治理", client: "客戶",
};
export const STATUS_LABEL: Record<SystemStatus, string> = { active: "進行中", paused: "暫停", done: "完成", archived: "封存" };
export const STATUS_BADGE: Record<SystemStatus, string> = { active: "badge-green", paused: "badge-yellow", done: "badge-gray", archived: "badge-gray" };
export const EFFECTIVE_LABEL: Record<EffectiveStatus, string> = { ...STATUS_LABEL, active: "開發中", maintenance: "維護中" };
export const EFFECTIVE_BADGE: Record<EffectiveStatus, string> = { ...STATUS_BADGE, maintenance: "badge-green" };
export const PRIORITY_LABEL: Record<Priority, string> = { high: "高", normal: "中", low: "低" };
export const FEATURE_LABEL: Record<FeatureStatus, string> = {
  todo: "未開始", in_progress: "進行中", implemented: "已實作", verified: "已驗收", blocked: "卡住", cancelled: "取消",
};
export const FEATURE_BADGE: Record<FeatureStatus, string> = {
  todo: "badge-gray", in_progress: "badge-yellow", implemented: "badge-yellow", verified: "badge-green", blocked: "badge-red", cancelled: "badge-gray",
};
export const EVENT_LABEL: Record<string, string> = {
  activity: "改動", handoff: "接續", feature_update: "功能狀態", status_change: "系統狀態", review: "驗收",
  revert: "撤銷", orphaned: "歷史分叉", migration: "舊頁搬入", import_run: "匯入",
};
export const SOURCE_LABEL: Record<string, string> = { agent: "AI", user: "操作者", migration: "搬移", importer: "匯入器" };
export const RESULT_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  saved: { ok: true, text: "已記下。" },
  forbidden: { ok: false, text: "只有擁有者或管理員能改。" },
  not_found: { ok: false, text: "找不到這個系統或功能。" },
  bad_input: { ok: false, text: "沒有可記的內容。" },
  legacy_phase: { ok: false, text: "這個功能的階段還在舊監工頁，請在那裡改；切換後才能在這裡驗收。" },
  db_unavailable: { ok: false, text: "資料庫暫時讀寫不了，沒有記下。" },
};

export const formatTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }) : "—";
