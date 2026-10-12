// How far a Cognitive OS research run has got, while it runs: the one thing the engine cannot see between the grant
// exchange (its run turns "running") and the completion (the report). Ingest batches reach the engine, but a batch
// is only sent every 10 admitted pages, so a run can spend over a minute with nothing the engine can show
// (2026-10-11: 75 s from exchange to the first batch; the page said 「系統正在找」 throughout).
//
// Counts only — no URL, title or query: the case's contents never leave the engine through this (lookups route
// header, R4). Process memory, same reason as run-jobs.ts: next-admin is one long-lived container, and the run's
// own crawl lives in this process. A restart loses an entry; the run's completion still reaches the engine.
//
// Read by GET /api/internal/collect/runs/progress (the engine's bearer). Nothing on the engine side polls it yet.

import type { CrawlProgress } from "@/lib/collect/orchestrator";

export interface ResearchProgress extends CrawlProgress {
  state: "running" | "done";
  startedAt: string;
  updatedAt: string;
}

const MAX_ENTRIES = 500;
const DONE_KEPT_MS = 30 * 60_000;
const runs = new Map<string, ResearchProgress & { at: number }>();

const keyOf = (projectId: string, runId: string) => `${projectId}/${runId}`;
const EMPTY: CrawlProgress = { pagesFound: 0, pagesChecked: 0, ingested: 0, setAside: 0 };

function prune(now: number): void {
  for (const [key, entry] of runs) if (entry.state === "done" && now - entry.at > DONE_KEPT_MS) runs.delete(key);
  // Oldest first (insertion order) when still over: a crawl's entry is rewritten with delete+set, so it stays newest.
  for (const key of runs.keys()) {
    if (runs.size < MAX_ENTRIES) break;
    runs.delete(key);
  }
}

function put(projectId: string, runId: string, entry: ResearchProgress, now: number): void {
  const key = keyOf(projectId, runId);
  runs.delete(key);
  runs.set(key, { ...entry, at: now });
}

export function startProgress(projectId: string, runId: string, now = Date.now()): void {
  prune(now);
  const at = new Date(now).toISOString();
  put(projectId, runId, { ...EMPTY, state: "running", startedAt: at, updatedAt: at }, now);
}

export function updateProgress(projectId: string, runId: string, p: CrawlProgress, now = Date.now()): void {
  const held = runs.get(keyOf(projectId, runId));
  if (!held || held.state === "done") return;
  put(projectId, runId, { ...held, ...p, updatedAt: new Date(now).toISOString() }, now);
}

export function finishProgress(projectId: string, runId: string, p: CrawlProgress | null, now = Date.now()): void {
  const held = runs.get(keyOf(projectId, runId));
  if (!held) return;
  put(projectId, runId, { ...held, ...(p ?? {}), state: "done", updatedAt: new Date(now).toISOString() }, now);
}

export function readProgress(projectId: string, runId: string): ResearchProgress | null {
  const held = runs.get(keyOf(projectId, runId));
  if (!held) return null;
  const { at: _at, ...out } = held;
  return out;
}
