// In-flight tracker for a manual collection run — the fix for the run button appearing to do
// nothing (2026-09-12: production nginx log showed repeated `POST .../collection-sources -> 499`,
// i.e. Cloudflare's own ~100s edge timeout killing the connection before a slow, rate-limited crawl
// could finish inside one HTTP request/response cycle; runCollection's own DEFAULT_BUDGET already
// allows up to 10 minutes, so this was never going to hold for a real run).
//
// Fix shape: the route no longer awaits runCollection() before responding. It registers the promise
// here and returns the runKey immediately; the browser polls run-status until the job leaves
// "running". Deliberately an in-memory Map, not a DB table:
//   * next-admin runs as one long-lived container (not multiple instances behind a load balancer),
//     so "this process's memory" is a complete view, not a shard of one.
//   * a dry run must leave no trace anywhere (run.ts's own comment) — the moment its progress lands
//     in a persisted table, that invariant breaks, and this endpoint services both dry and real runs
//     with the same status shape.
// Real runs still get their durable record exactly as before, via persistRunReport at the end.
//
// Traded away on purpose: a job in progress during a deploy/restart vanishes from this map. The
// crawl itself is unaffected (it is a plain in-process async call, not cancelled by losing the
// tracking entry) and a real run's outcome is still recoverable afterward from `collection_runs` /
// the source's own lastRunAt — only the currently-open browser tab's "is it done yet" polling loses
// its answer, and only for the one run that happened to be mid-flight at that moment.

import type { RunCollectionResult } from "@/lib/collect/run";

// Generic over the result type (2026-09-18, closing the collect -> Cognitive OS loop): the send-to-
// Cognitive-OS action needs this exact same "start async, poll by key" infrastructure for a
// completely different result shape (ImportSummary, not RunCollectionResult) -- everything below this
// line was already result-shape-agnostic in practice (Map<string, {status,startedAt,result,error}>),
// only the type annotations were needlessly narrow. `<T = RunCollectionResult>` keeps every existing
// caller's inferred type identical with zero call-site changes.
export interface RunJob<T = RunCollectionResult> {
  /** Which feature registered this job (critic finding, 2026-09-18): the map is shared across job
   *  kinds keyed only by caller-chosen `runKey` strings — this discriminant is checked by getRunJob
   *  so a future job kind that forgets its own key-namespacing convention gets a clean `null`
   *  ("not found") instead of silently reading another kind's differently-shaped result object. */
  kind: string;
  status: "running" | "done" | "error";
  startedAt: number;
  result?: T;
  error?: string;
}

const jobs = new Map<string, RunJob<unknown>>();

/**
 * Terminal jobs older than this are pruned on the next write. NOT applied to "running" jobs
 * (critic finding, 2026-09-12): runCollection's own fetch budget caps at 10 minutes, but
 * persistRunReport + recordRunOutcome run AFTER that, unbounded by it — a slow/degraded Supabase
 * could push a legitimate run past 30 minutes of wall-clock age while it is still genuinely
 * in flight. Pruning by age alone would delete that entry, and its eventual completion would then
 * silently no-op (the `if (job)` guards in startRunJob's .then/.catch), turning a real result into
 * an indistinguishable-from-"server restarted" gap for whichever tab was polling it.
 */
const MAX_AGE_MS = 30 * 60_000;

function prune(now: number) {
  for (const [key, job] of jobs) {
    if (job.status !== "running" && now - job.startedAt > MAX_AGE_MS) jobs.delete(key);
  }
}

/**
 * Register a run under `runKey` and let it proceed in the background. Never rejects — a thrown
 * error becomes a "error" status instead of an unhandled rejection, since nothing downstream awaits
 * this call. `kind` must be the same literal every caller in one feature uses (e.g. "collection-run",
 * "cognitive-os-import") — getRunJob checks it before returning a result.
 */
export function startRunJob<T = RunCollectionResult>(kind: string, runKey: string, work: Promise<T>): void {
  const now = Date.now();
  prune(now);
  jobs.set(runKey, { kind, status: "running", startedAt: now });
  work.then(
    (result) => {
      const job = jobs.get(runKey);
      if (job) {
        job.status = "done";
        job.result = result;
      }
    },
    (err) => {
      const job = jobs.get(runKey);
      if (job) {
        job.status = "error";
        job.error = String(err).slice(0, 500);
      }
    },
  );
}

export function getRunJob<T = RunCollectionResult>(kind: string, runKey: string): RunJob<T> | null {
  const job = jobs.get(runKey);
  if (!job || job.kind !== kind) return null;
  // Cast is now backed by the kind check above, not just caller discipline: a mismatched kind
  // returns null before this line, rather than a wrongly-shaped object with no error.
  return job as RunJob<T>;
}
