// What GET /projects, /projects/{id}, /projects/{id}/analyses, /tasks and /reruns return (ai_lego/apps/api/main.py), and
// how the pages say it. An analysis's status is read from the project's event log (ProjectSourceRepository.analyses).
export type Stance = "agree" | "partial" | "disagree";
export type Approval = { decision: "approve" | "return"; at: string; by_name?: string | null; reason?: string | null };
export type Analysis = {
  interpretation_id: string; method_id: string | null; status: "PENDING" | "DONE" | "FAILED";
  requested_at: string; finished_at: string | null; error: string | null; judgment: Stance | null; approval?: Approval | null; revision_of?: string | null;
};
export type Task = { task_id: string; interpretation_id: string | null; title: string; owner: string; due: string; proof: string; target: string; when: string; created_at: string; done: boolean; done_at: string | null };
export type Rerun = { rerun_id: string; interpretation_id: string; method_id: string | null; due: string; scheduled_at: string; fulfilled_by: string | null; fulfilled_at: string | null };
export type Project = {
  project_id: string; name: string; purpose?: string; created_at: string;
  updated_at?: string; analysis_count?: number; methods?: string[]; latest_analysis?: Analysis | null;
  tasks?: { open: number; overdue: number; due_today: number; next_due: string | null }; reruns_due?: number;
};
// N-85: a project's sources, for ProjectPage's own Sources card (GET/POST /projects/{id}/sources).
export type Source = { source_id: string; title: string; created_at: string };
// N-66: what stays after DELETE /projects/{id} -- the row itself is gone (GET /projects/erased).
export type ErasedProject = { project_id: string; erased_at: string; erased_by_identity_id: string; sources: number; blobs_unlinked: number; artifacts_deleted: number; events_deleted: number };
export type Estimate = { method_id: string; model: string; input_tokens: number; output_tokens: number; tokens: number; twd: number | null; based_on: number; tokens_max?: number; twd_max?: number | null; seconds?: number };

/** How long a run takes, from the tenant's own last runs (the API's estimate), in words: 約 2 分鐘. */
export function runMinutes(estimate: Estimate | null | undefined): string {
  const seconds = estimate?.seconds;
  if (!seconds) return "約兩到三分鐘";
  return seconds < 90 ? "約 1 分鐘" : `約 ${Math.round(seconds / 60)} 分鐘`;
}

export const STATUS: Record<Analysis["status"], string> = { DONE: "分析完成", PENDING: "分析中", FAILED: "分析沒有完成" };
export const STANCE: Record<Stance, string> = { agree: "同意", partial: "部分同意", disagree: "不同意" };

/** Where an analysis stands, in the words of the mock's 走到哪 column. */
export function standing(analysis: Analysis | null | undefined): string {
  if (!analysis) return "還沒分析";
  if (analysis.status === "PENDING") return "分析（進行中）";
  if (analysis.status === "FAILED") return "分析（沒有完成）";
  if (analysis.approval?.decision === "approve") return "核准（已核准）";
  if (analysis.approval?.decision === "return") return "報表（已退回，待重做）";
  return "報表（AI 草稿・尚未核准）";
}

/** Money the way the mock writes it: 約 6k tokens・≈ NT$1. */
export function costLine(tokens: number, twd: number | null | undefined): string {
  const k = tokens >= 1000 ? `${Math.max(1, Math.round(tokens / 1000))}k` : String(tokens);
  return `約 ${k} tokens${twd == null ? "" : `・≈ NT$${twd < 1 ? "1 以下" : Math.round(twd)}`}`;
}

/** The date `days` from today, YYYY-MM-DD (local). */
export function plusDays(days: number): string {
  const date = new Date(); date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
/** Today, YYYY-MM-DD, in the browser's own zone (a UTC date is yesterday's before 08:00 in Taipei). */
export const todayIso = () => plusDays(0);
/** "90 天" -> 90; "一期（6 次）" -> null. */
export function daysOf(horizon: string | undefined): number | null {
  const match = /(\d+)\s*(天|日)/.exec(horizon ?? "");
  if (match) return Number(match[1]);
  const weeks = /(\d+)\s*(週|周)/.exec(horizon ?? "");
  if (weeks) return Number(weeks[1]) * 7;
  const months = /(\d+)\s*個?月/.exec(horizon ?? "");
  return months ? Number(months[1]) * 30 : null;
}

/** Most recently active first (a new analysis puts its project on top). */
export const byActivity = (a: Project, b: Project) => (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at);
