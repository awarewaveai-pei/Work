/**
 * In-memory tarot batch job store.
 * Single-instance SG — survives restarts only if jobs are re-queried from Trigger.dev.
 * For production durability, replace with Supabase `tarot_batch_jobs` table.
 */

export interface BatchCardResult {
  cardIndex: number;
  cardName: string;
  url: string;       // R2 public URL of the raw generated image
  error?: string;
}

export type BatchJobStatus = "pending" | "running" | "done" | "error";

export interface BatchJob {
  jobId: string;
  model: string;
  aspectRatio: string;
  totalCards: number;
  completedCards: number;
  failedCards: number;
  status: BatchJobStatus;
  results: BatchCardResult[];
  createdAt: number; // Date.now()
  updatedAt: number;
}

const store = new Map<string, BatchJob>();

export function createJob(
  jobId: string,
  model: string,
  aspectRatio: string,
  totalCards: number,
): BatchJob {
  const job: BatchJob = {
    jobId,
    model,
    aspectRatio,
    totalCards,
    completedCards: 0,
    failedCards: 0,
    status: "pending",
    results: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  store.set(jobId, job);
  return job;
}

export function deleteJob(jobId: string): void {
  store.delete(jobId);
}

export function getJob(jobId: string): BatchJob | undefined {
  return store.get(jobId);
}

export function markRunning(jobId: string): boolean {
  const job = store.get(jobId);
  if (!job) return false;
  job.status = "running";
  job.updatedAt = Date.now();
  return true;
}

export function recordCardResult(
  jobId: string,
  result: BatchCardResult,
): BatchJob | null {
  const job = store.get(jobId);
  if (!job) return null;

  if (result.error) {
    job.failedCards++;
  } else {
    job.completedCards++;
    job.results.push(result);
  }

  job.updatedAt = Date.now();
  if (job.completedCards + job.failedCards >= job.totalCards) {
    job.status = job.failedCards === job.totalCards ? "error" : "done";
  }
  return job;
}

export function listRecentJobs(limit = 10): BatchJob[] {
  return Array.from(store.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}
