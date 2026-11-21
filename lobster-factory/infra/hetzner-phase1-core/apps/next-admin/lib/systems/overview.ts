// Pure helpers for the /ops/systems overview and detail pages (no I/O, no clock reads: `now` is passed in).
import { chronological, liveEvents, type SystemProjection, type UpdateRow } from "./projection";

export const STALL_DAYS = 30;

export interface CountInput { status: SystemProjection["status"]; featureCount: number; blocker: string | null; lastActivityAt: string | null }
export interface OverviewCounts { total: number; active: number; needsAttention: number; wrapped: number }

/** Four stat cards. 待確認 = still moving (not done / archived / paused) and either blocked, not inventoried yet
 *  (registry lists no features at all; features still on an old supervisor page count as inventoried) or silent for STALL_DAYS. 維護與已完成 = done + archived. */
export function overviewCounts(rows: readonly CountInput[], now: number): OverviewCounts {
  const stallMs = STALL_DAYS * 86400000;
  const attention = (r: CountInput) => {
    if (r.status === "done" || r.status === "archived" || r.status === "paused") return false;
    if (r.blocker) return true;
    if (r.featureCount === 0) return true;
    const at = r.lastActivityAt ? Date.parse(r.lastActivityAt) : NaN;
    return !Number.isFinite(at) || now - at > stallMs;
  };
  return {
    total: rows.length,
    active: rows.filter((r) => r.status === "active").length,
    needsAttention: rows.filter(attention).length,
    wrapped: rows.filter((r) => r.status === "done" || r.status === "archived").length,
  };
}

export interface HandoffInput { slug: string; name: string; handoff: SystemProjection["handoff"] }

/** Newest `limit` systems that carry a usable handoff (a next step or a blocker), newest handoff first. */
export function recentHandoffs<T extends HandoffInput>(rows: readonly T[], limit = 3): T[] {
  const stamp = (r: T) => Date.parse(r.handoff.lastAt ?? r.handoff.nextAt ?? r.handoff.blockerAt ?? "") || 0;
  return rows.filter((r) => r.handoff.next || r.handoff.blocker).sort((a, b) => stamp(b) - stamp(a)).slice(0, limit);
}

export const GAP_LABEL: Record<string, string> = {
  unowned_paths: "未歸屬路徑", unclassified_trailers: "未分類 trailer", unregistered_products: "未登記產品",
  unclaimed_supervisors: "未認領監工頁", dead_source_paths: "失效來源路徑",
};

/** Gap counts of the newest import run, by kind (zero kinds kept so the page can say "0"). */
export function gapBreakdown(runs: readonly UpdateRow[]): Array<{ key: string; label: string; count: number }> {
  const latest = chronological(runs.filter((r) => r.event_type === "import_run")).pop();
  const gaps = latest && typeof latest.payload.gaps === "object" && latest.payload.gaps !== null ? (latest.payload.gaps as Record<string, unknown>) : {};
  return Object.entries(GAP_LABEL).map(([key, label]) => ({ key, label, count: Array.isArray(gaps[key]) ? (gaps[key] as unknown[]).length : 0 }));
}

/** What the 進度 cell says: a number, 尚未盤點 (registry lists no features) or 進度在舊監工頁 (every feature still lives there). */
export function progressKind(p: { features: ReadonlyArray<{ legacy: boolean }>; counted: number }): "number" | "empty" | "legacy" {
  if (p.features.length === 0) return "empty";
  if (p.counted > 0) return "number";
  return p.features.some((f) => f.legacy) ? "legacy" : "empty";
}

/** 歷史標示完成 = migrated features whose old supervisor page said done, ÷ migrated features. null = nothing migrated.
 *  Reverted / orphaned commits do not count (liveEvents) and only features still in the registry (`featureIds`) do. */
export function legacyDone(events: readonly UpdateRow[], history: readonly UpdateRow[], featureIds: ReadonlySet<string>): { done: number; total: number; ratio: number | null } {
  const latest = new Map<string, UpdateRow>();
  for (const e of chronological(liveEvents(events, history))) if (e.event_type === "migration" && e.feature_id && featureIds.has(e.feature_id)) latest.set(e.feature_id, e);
  const total = latest.size;
  const done = [...latest.values()].filter((e) => e.payload.legacy_status === "done").length;
  return { done, total, ratio: total ? done / total : null };
}

/** One line of user-controlled text made safe to drop into Markdown: one line, no markup-active characters. */
export function mdInline(v: unknown): string {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s.replace(/[\\`*_~[\]<>|]/g, (c) => `\\${c}`).replace(/^([#+\-]|\d+\.)/, "\\$1");
}

export interface BriefInput {
  name: string; purpose: string; type: string; sourcePaths: readonly string[];
  features: ReadonlyArray<{ name: string; status: string; legacy: boolean }>;
  next: string | null; blocker: string | null; lastSubject: string | null; lastAt: string | null;
  importHead: string | null; importAt: string | null;
}

/** 接續摘要 for a fresh AI session (GPT spec 7.2): 專案簡介／已驗收／已實作待驗證／未完成與卡點／上次完成／下一步／來源. */
export function buildResumeMarkdown(i: BriefInput, formatTime: (iso: string | null) => string = (x) => x ?? "—"): string {
  const live = i.features.filter((f) => !f.legacy && f.status !== "cancelled");
  const list = (items: string[], empty: string) => (items.length ? items.map((x) => `- ${mdInline(x)}`).join("\n") : `- ${empty}`);
  const verified = live.filter((f) => f.status === "verified").map((f) => f.name);
  const pending = live.filter((f) => f.status === "implemented").map((f) => f.name);
  const open = live.filter((f) => f.status !== "verified" && f.status !== "implemented").map((f) => `${f.name}（${f.status}）`);
  const legacy = i.features.filter((f) => f.legacy).length;
  const lines = [
    `# ${mdInline(i.name)} — 接續摘要`,
    "",
    "## 專案簡介",
    `${mdInline(i.purpose) || "（用途未填）"}（類型：${mdInline(i.type)}）`,
    "",
    "## 已驗收",
    list(verified, "尚無"),
    "",
    "## 已實作待驗證",
    list(pending, "無"),
    "",
    "## 未完成與卡點",
    list(open, live.length ? "無" : "尚未盤點功能"),
    ...(legacy ? [`- 另有 ${legacy} 個功能還在舊監工頁，進度請看舊頁`] : []),
    `- 卡點：${i.blocker ? mdInline(i.blocker) : "無"}`,
    "",
    "## 上次完成",
    i.lastSubject ? `${mdInline(i.lastSubject)}（${formatTime(i.lastAt)}）` : "沒有接續紀錄",
    "",
    "## 下一步",
    i.next ? mdInline(i.next) : "還沒有人寫下一步",
    "",
    "## 來源",
    `- 程式位置：${i.sourcePaths.length ? i.sourcePaths.map((p) => `\`${p.replace(/`/g, "")}\``).join("、") : "—"}`,
    `- 資料匯入：${i.importAt ? `${formatTime(i.importAt)}，HEAD ${i.importHead ? i.importHead.slice(0, 9) : "—"}` : "尚無匯入紀錄"}`,
    "- 狀態以 /ops/systems 事件投影為準；「已驗收」只來自操作者驗收事件。",
  ];
  return lines.join("\n");
}
