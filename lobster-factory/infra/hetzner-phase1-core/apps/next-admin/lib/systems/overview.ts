// Pure helpers for the /ops/systems overview and detail pages (no I/O, no clock reads: `now` is passed in).
import { chronological, liveEvents, projectSystem, type FeatureRow, type PhaseRow, type SystemProjection, type SystemRow, type UpdateRow } from "./projection";

export const STALL_DAYS = 30;
/** all features done: a commit within this many days = 維護中, older = 已完成 */
export const ACTIVE_DAYS = 14;
/** work still open: 開發中 until this many days without a commit, then 暫停 (operator 2026-11-24: half a year) */
export const PAUSE_DAYS = 180;

export type EffectiveStatus = NonNullable<SystemProjection["status"]> | "maintenance";
export interface EffectiveState { status: EffectiveStatus | null; inferred: boolean }

/** A recorded status_change always wins. Without one, infer from the features and the last commit (projection
 *  lastCommitAt -- a page click such as a review is not work on the system). Quiet is not finished:
 *  - every counted feature implemented or verified: commit <= ACTIVE_DAYS 維護中, older 已完成;
 *  - otherwise (open work, or no feature list): <= PAUSE_DAYS 開發中, older 暫停.
 *  No commit at all stays null (未設定). `inferred` drives the 「（推定）」 suffix. */
export function effectiveStatus(
  status: SystemProjection["status"], lastCommitAt: string | null, now: number,
  work?: { counted: number; verified: number; implemented: number },
): EffectiveState {
  if (status) return { status, inferred: false };
  const at = lastCommitAt ? Date.parse(lastCommitAt) : NaN;
  if (!Number.isFinite(at)) return { status: null, inferred: false };
  const days = (now - at) / 86400000;
  const allBuilt = !!work && work.counted > 0 && work.verified + work.implemented >= work.counted;
  if (allBuilt) return { status: days <= ACTIVE_DAYS ? "maintenance" : "done", inferred: true };
  return { status: days <= PAUSE_DAYS ? "active" : "paused", inferred: true };
}

/** 已實作 = (implemented + verified) / counted features; null when nothing is counted. */
export function implementedRatio(p: { counted: number; verified: number; implemented: number }): number | null {
  return p.counted ? (p.implemented + p.verified) / p.counted : null;
}

export interface CountInput { status: EffectiveStatus | null; inferred: boolean; featureCount: number; blocker: string | null; lastCommitAt: string | null }
export interface OverviewCounts { total: number; active: number; needsAttention: number; wrapped: number }

/** Four stat cards. 待確認 = not set to done / archived / paused by someone (an inferred status never takes a system out)
 *  and either blocked, 暫停（推定） (open work, no commit for PAUSE_DAYS), or 開發中 (set or inferred) with no git commit
 *  for STALL_DAYS. 尚未盤點 (no features) is not a reason:
 *  the table shows it on its own. Inferred values count only on 開發中 and 維護與已完成 (maintenance + done + archived). */
export type OverviewGroup = "active" | "attention" | "wrapped";

/** Which stat card a system falls in; null = a status set to 暫停 / 未設定 (no card). 待確認 wins, so the cards split. */
export function overviewGroup(r: CountInput, now: number): OverviewGroup | null {
  const settled = !r.inferred && (r.status === "done" || r.status === "archived" || r.status === "paused");
  const at = r.lastCommitAt ? Date.parse(r.lastCommitAt) : NaN;
  const attention = !settled && (!!r.blocker || (r.inferred && r.status === "paused") // half a year untouched with work open
    || (r.status === "active" && (!Number.isFinite(at) || now - at > STALL_DAYS * 86400000)));
  if (attention) return "attention";
  if (r.status === "active") return "active";
  if (r.status === "done" || r.status === "archived" || r.status === "maintenance") return "wrapped";
  return null;
}

export function overviewCounts(rows: readonly CountInput[], now: number): OverviewCounts {
  const groups = rows.map((r) => overviewGroup(r, now));
  return {
    total: rows.length,
    // 開發中 + 待確認 + 維護與已完成 (+ set 暫停 / 未設定) = 總數
    active: groups.filter((g) => g === "active").length,
    needsAttention: groups.filter((g) => g === "attention").length,
    wrapped: groups.filter((g) => g === "wrapped").length,
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
  unclaimed_supervisors: "未認領監工頁", dead_source_paths: "失效來源路徑", unmapped_cards: "監工頁卡未登記",
};

/** Phase ids whose supervisor page the newest ok import run still reads (payload.live_phases): 每晚從監工頁同步. An
 *  error or diverged run reads no page, so it says nothing either way. */
export function livePhases(runs: readonly UpdateRow[]): Set<string> {
  const latest = chronological(runs.filter((r) => r.event_type === "import_run" && r.payload.status === "ok")).pop();
  const ids = latest?.payload.live_phases;
  return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []);
}

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

export interface SystemOverviewRow { system: SystemRow; p: SystemProjection; eff: EffectiveState }

/** Every system projected once with its effective status (store.readDefinitions + store.readProjectionInput). */
export function projectAll(
  defs: { systems: readonly SystemRow[]; phases: readonly PhaseRow[]; features: readonly FeatureRow[] },
  state: { events: readonly UpdateRow[]; history: readonly UpdateRow[]; lastCommitAt: Record<string, string>; spreadCommits: Set<string> },
  now: number,
): SystemOverviewRow[] {
  return defs.systems.map((system) => {
    const p = projectSystem({
      phases: defs.phases.filter((x) => x.system_id === system.id),
      features: defs.features.filter((x) => x.system_id === system.id),
      events: state.events.filter((e) => e.system_id === system.id),
      history: state.history,
      lastCommitAt: state.lastCommitAt[system.id] ?? null, spreadCommits: state.spreadCommits,
    });
    return { system, p, eff: effectiveStatus(p.status, p.lastCommitAt, now, p) };
  });
}
