// Hands one Cognitive OS research run to next-admin's /api/internal/collect/runs/execute, where the crawler lives
// (RESEARCH_LINES_MASTER_PLAN §12.7 I-c). Mirrors postRunDueSchedules.ts: its own bearer
// (COLLECT_RESEARCH_EXECUTE_TOKEN), never a shared one. The payload carries a grant REFERENCE only; next-admin
// exchanges it for the token, so no token passes through Trigger.

export interface ResearchRunPayload {
  grant_ref: string;
  project_id: string;
  run_id: string;
  seeds: Array<{ uri: string; meta?: Record<string, unknown> }>;
  budget: { fetches: number };
}

export interface ResearchRunExecuteResult {
  ok: boolean;
  status: "completed" | "failed";
  report: { fetched: number; written: number; unchanged: number; refused: number; stopped_by: string };
  error?: string;
}

// Above next-admin's maxDuration (300 s) so the route, not this caller, decides when a crawl is too long.
const TIMEOUT_MS = 330_000;

export async function postResearchRunExecute(payload: ResearchRunPayload): Promise<ResearchRunExecuteResult> {
  const token = process.env.COLLECT_RESEARCH_EXECUTE_TOKEN?.trim();
  const base = (process.env.AWAREWAVE_WEBHOOK_BASE_URL ?? "https://app.aware-wave.com").replace(/\/$/, "");
  if (!token) {
    throw new Error("COLLECT_RESEARCH_EXECUTE_TOKEN is required on Trigger worker");
  }

  const res = await fetch(`${base}/api/internal/collect/runs/execute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`collect runs/execute ${res.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text) as ResearchRunExecuteResult;
}
