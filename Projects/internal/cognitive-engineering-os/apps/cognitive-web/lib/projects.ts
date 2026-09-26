// What GET /projects, /projects/{id} and /projects/{id}/analyses return (ai_lego/apps/api/main.py), and how the pages
// say it. An analysis's status is read from the project's event log (ProjectSourceRepository.analyses).
export type Stance = "agree" | "partial" | "disagree";
export type Analysis = {
  interpretation_id: string; method_id: string | null; status: "PENDING" | "DONE" | "FAILED";
  requested_at: string; finished_at: string | null; error: string | null; judgment: Stance | null;
};
export type Project = {
  project_id: string; name: string; purpose?: string; created_at: string;
  updated_at?: string; analysis_count?: number; methods?: string[]; latest_analysis?: Analysis | null;
};

export const STATUS: Record<Analysis["status"], string> = { DONE: "分析完成", PENDING: "分析中", FAILED: "分析沒有完成" };
export const STANCE: Record<Stance, string> = { agree: "同意", partial: "部分同意", disagree: "不同意" };

/** Most recently active first (a new analysis puts its project on top). */
export const byActivity = (a: Project, b: Project) => (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at);
