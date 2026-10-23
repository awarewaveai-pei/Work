/**
 * Tarot background batch store: rows in Supabase (migration 0115), never process memory.
 *
 * Invariant: a job's progress and outcome are derived from its card rows, keyed (job_id, card_index), plus the
 * job's stored lifecycle and deadline_at. So a retried card callback cannot count twice or generate twice
 * (claimCard), a job past its deadline reports timed_out instead of running forever (summarizeBatch), and a
 * next-admin restart loses nothing. Same move as lib/content/video/job-store.ts (0047, 2026-06-19).
 * Access is service_role only (getSupabaseWriteClient); the browser reads through /api/tools/tarot/batch/*.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export interface BatchCardResult {
  cardIndex: number;
  cardName: string;
  url: string; // R2 public URL of the raw generated image
}

export interface BatchCardFailure {
  cardIndex: number;
  cardName: string;
  error: string;
}

/** Status the browser understands (TarotStudio stops polling on done/error). */
export type BatchJobStatus = "pending" | "running" | "done" | "error";
/** Precise state; timed_out is reported to old clients as status "error". */
export type BatchJobState = BatchJobStatus | "timed_out";

export interface BatchJob {
  jobId: string;
  model: string;
  aspectRatio: string;
  totalCards: number;
  completedCards: number;
  failedCards: number;
  status: BatchJobStatus;
  state: BatchJobState;
  error?: string;
  results: BatchCardResult[];
  failures: BatchCardFailure[];
  runId?: string;
  createdAt: number;
  updatedAt: number;
  deadlineAt: number;
}

export interface StoredBatchJob extends BatchJob {
  organizationId: string | null;
  createdBy: string | null;
  /** Who started the batch (requestActor); the card callback asks tarot.image as this actor (0119). */
  actor: string | null;
}

// Worker budget: tarot-batch-generate.ts maxDuration (10_800 s) + 10 min. Keep the two in step.
export const RUN_BUDGET_MS = (10_800 + 600) * 1000;
// Before the start callback the run may be queued behind other batches (queue concurrencyLimit 2).
export const PENDING_BUDGET_MS = 6 * 60 * 60 * 1000;
// A card claim older than this may be claimed again (one generation is ~60 s + R2 upload).
export const CARD_LEASE_SECONDS = 180;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const JOBS = "tarot_batch_jobs";
const CARDS = "tarot_batch_cards";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TERMINAL: ReadonlySet<BatchJobState> = new Set(["done", "error", "timed_out"]);
// Trigger.dev run statuses after which the run does nothing more.
const RUN_ENDED = new Set(["COMPLETED", "CANCELED", "FAILED", "CRASHED", "SYSTEM_FAILURE", "TIMED_OUT", "EXPIRED"]);

export class BatchStoreUnavailableError extends Error {
  constructor(message = "batch_store_unavailable") {
    super(message);
    this.name = "BatchStoreUnavailableError";
  }
}

function db(): SupabaseClient {
  const client = getSupabaseWriteClient();
  if (!client) throw new BatchStoreUnavailableError("batch_store_unavailable: service-role Supabase not configured");
  return client;
}

export interface JobRow {
  id: string;
  organization_id: string | null;
  created_by: string | null;
  actor?: string | null;
  run_id: string | null;
  model: string;
  aspect_ratio: string;
  total_cards: number;
  status: BatchJobState;
  error: string | null;
  deadline_at: string;
  created_at: string;
  updated_at: string;
}

export interface CardRow {
  job_id: string;
  card_index: number;
  card_name: string;
  status: "generating" | "done" | "error";
  url: string | null;
  error: string | null;
}

/**
 * Pure: job row + its card rows (+ optional Trigger run status) at `now` -> what the job is.
 * Order: all cards finished > stored terminal > run ended > deadline passed > stored pending/running.
 */
export function summarizeBatch(job: JobRow, cards: CardRow[], now: number, runStatus?: string | null): StoredBatchJob {
  const own = cards.filter((c) => c.job_id === job.id).sort((a, b) => a.card_index - b.card_index);
  const results = own.filter((c) => c.status === "done" && c.url)
    .map((c) => ({ cardIndex: c.card_index, cardName: c.card_name, url: c.url as string }));
  const failures = own.filter((c) => c.status === "error")
    .map((c) => ({ cardIndex: c.card_index, cardName: c.card_name, error: c.error ?? "unknown_error" }));
  const done = results.length;
  const failed = failures.length;
  const deadlineAt = new Date(job.deadline_at).getTime();

  let state: BatchJobState = job.status;
  let error: string | undefined = job.error ?? undefined;
  if (done + failed >= job.total_cards) {
    state = failed === job.total_cards ? "error" : "done";
  } else if (TERMINAL.has(job.status)) {
    state = job.status;
  } else if (runStatus && RUN_ENDED.has(runStatus)) {
    if (runStatus === "TIMED_OUT") { state = "timed_out"; error = "timed_out"; }
    // The run ended with cards unaccounted for (worker stopped early, e.g. quota): not a finished deck.
    else if (runStatus === "COMPLETED") { state = "error"; error = "run_ended_incomplete"; }
    else { state = "error"; error = `run_${runStatus.toLowerCase()}`; }
  } else if (now > deadlineAt) {
    state = "timed_out";
    error = "timed_out";
  }

  return {
    jobId: job.id,
    model: job.model,
    aspectRatio: job.aspect_ratio,
    totalCards: job.total_cards,
    completedCards: done,
    failedCards: failed,
    status: state === "timed_out" ? "error" : state,
    state,
    error,
    results,
    failures,
    runId: job.run_id ?? undefined,
    createdAt: new Date(job.created_at).getTime(),
    updatedAt: new Date(job.updated_at).getTime(),
    deadlineAt,
    organizationId: job.organization_id,
    createdBy: job.created_by,
    actor: job.actor ?? null,
  };
}

/** Public shape (no tenant fields). */
export function toPublicJob(job: StoredBatchJob): BatchJob {
  const { organizationId: _o, createdBy: _c, actor: _a, ...pub } = job;
  return pub;
}

export async function createJob(input: {
  jobId: string;
  organizationId: string | null;
  createdBy: string | null;
  actor: string;
  model: string;
  aspectRatio: string;
  totalCards: number;
  now?: number;
}): Promise<void> {
  const now = input.now ?? Date.now();
  const client = db();
  const { error } = await client.from(JOBS).insert({
    id: input.jobId,
    organization_id: input.organizationId,
    created_by: input.createdBy && UUID_RE.test(input.createdBy) ? input.createdBy : null,
    actor: input.actor.slice(0, 300),
    model: input.model,
    aspect_ratio: input.aspectRatio,
    total_cards: input.totalCards,
    status: "pending",
    deadline_at: new Date(now + PENDING_BUDGET_MS).toISOString(),
  });
  if (error) throw new BatchStoreUnavailableError(`batch_store_insert_failed: ${error.message}`);
  // Best-effort TTL cleanup (cards cascade). The builder only runs when then() is called.
  void client.from(JOBS).delete().lt("created_at", new Date(now - TTL_MS).toISOString()).then(
    ({ error: e }) => { if (e) console.warn("[tarot-batch-store] TTL cleanup failed:", e.message); },
    (e) => console.warn("[tarot-batch-store] TTL cleanup failed:", String(e)),
  );
}

export async function setRunId(jobId: string, runId: string): Promise<void> {
  const { error } = await db().from(JOBS).update({ run_id: runId, updated_at: new Date().toISOString() }).eq("id", jobId);
  if (error) console.warn("[tarot-batch-store] setRunId failed:", error.message);
}

export async function deleteJob(jobId: string): Promise<void> {
  const { error } = await db().from(JOBS).delete().eq("id", jobId);
  if (error) console.warn("[tarot-batch-store] deleteJob failed:", error.message);
}

/** Start callback: pending -> running, and the deadline becomes now + the run budget. False = unknown job. */
export async function markRunning(jobId: string, now = Date.now()): Promise<boolean> {
  if (!UUID_RE.test(jobId)) return false;
  const client = db();
  const { data, error } = await client.from(JOBS)
    .update({ status: "running", deadline_at: new Date(now + RUN_BUDGET_MS).toISOString(), updated_at: new Date(now).toISOString() })
    .eq("id", jobId).eq("status", "pending").select("id");
  if (error) throw new BatchStoreUnavailableError(`batch_store_update_failed: ${error.message}`);
  if (Array.isArray(data) && data.length > 0) return true;
  const { data: row, error: e2 } = await client.from(JOBS).select("id").eq("id", jobId).maybeSingle();
  if (e2) throw new BatchStoreUnavailableError(`batch_store_read_failed: ${e2.message}`);
  return !!row; // duplicate start of a known job is fine
}

export type ClaimResult =
  | { outcome: "claimed" }
  | { outcome: "done"; url: string }
  | { outcome: "in_progress" }
  | { outcome: "no_job" };

/** Claim a card before generating it (atomic in tarot_batch_claim_card, 0115). */
export async function claimCard(jobId: string, cardIndex: number, cardName: string): Promise<ClaimResult> {
  const { data, error } = await db().rpc("tarot_batch_claim_card", {
    p_job_id: jobId, p_card_index: cardIndex, p_card_name: cardName, p_lease_seconds: CARD_LEASE_SECONDS,
  });
  if (error) throw new BatchStoreUnavailableError(`batch_store_claim_failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as { claim_outcome?: string; done_url?: string | null } | null;
  switch (row?.claim_outcome) {
    case "claimed": return { outcome: "claimed" };
    case "done": return { outcome: "done", url: row.done_url ?? "" };
    case "in_progress": return { outcome: "in_progress" };
    case "no_job": return { outcome: "no_job" };
    default: throw new BatchStoreUnavailableError(`batch_store_claim_failed: unexpected ${JSON.stringify(row)}`);
  }
}

/** Record a claimed card's outcome. A done card is never overwritten (tarot_batch_finish_card, 0115). */
// One "fetch failed" on this write left card 48 of job e8486f5f "generating" with its image already in R2, and the
// whole 78-card job ended as error (2026-10-23). The write is idempotent (same row, same outcome), so it is retried.
const FINISH_RETRY_MS = [500, 2_000, 5_000];

export async function finishCard(
  jobId: string,
  cardIndex: number,
  outcome: { url: string } | { error: string },
  opts: { retryMs?: readonly number[] } = {},
): Promise<void> {
  const waits = opts.retryMs ?? FINISH_RETRY_MS;
  let last = "";
  for (let attempt = 0; attempt <= waits.length; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, waits[attempt - 1]));
    try {
      const { error } = await db().rpc("tarot_batch_finish_card", {
        p_job_id: jobId,
        p_card_index: cardIndex,
        p_url: "url" in outcome ? outcome.url : null,
        p_error: "error" in outcome ? outcome.error : null,
      });
      if (!error) return;
      last = error.message;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new BatchStoreUnavailableError(`batch_store_finish_failed: ${last}`);
}

async function readCards(client: SupabaseClient, jobIds: string[]): Promise<CardRow[]> {
  if (jobIds.length === 0) return [];
  const { data, error } = await client.from(CARDS)
    .select("job_id, card_index, card_name, status, url, error").in("job_id", jobIds);
  if (error) throw new BatchStoreUnavailableError(`batch_store_read_failed: ${error.message}`);
  return (data ?? []) as CardRow[];
}

/** Persist a newly derived terminal state once, so later reads need no Trigger call. Best-effort. */
async function persistTerminal(client: SupabaseClient, row: JobRow, job: StoredBatchJob): Promise<void> {
  if (!TERMINAL.has(job.state) || TERMINAL.has(row.status)) return;
  const { error } = await client.from(JOBS)
    .update({ status: job.state, error: job.error ?? null, updated_at: new Date().toISOString() })
    .eq("id", row.id).in("status", ["pending", "running"]);
  if (error) console.warn("[tarot-batch-store] persistTerminal failed:", error.message);
}

export type RunStatusLookup = (runId: string) => Promise<string | null>;

export async function getJob(jobId: string, opts: { now?: number; runStatus?: RunStatusLookup } = {}): Promise<StoredBatchJob | undefined> {
  if (!UUID_RE.test(jobId)) return undefined;
  const client = db();
  const { data, error } = await client.from(JOBS).select("*").eq("id", jobId).maybeSingle();
  if (error) throw new BatchStoreUnavailableError(`batch_store_read_failed: ${error.message}`);
  if (!data) return undefined;
  const row = data as JobRow;
  const cards = await readCards(client, [row.id]);
  const now = opts.now ?? Date.now();
  let job = summarizeBatch(row, cards, now);
  if (!TERMINAL.has(job.state) && row.run_id && opts.runStatus) {
    const runStatus = await opts.runStatus(row.run_id).catch(() => null);
    job = summarizeBatch(row, cards, now, runStatus);
  }
  await persistTerminal(client, row, job);
  return job;
}

/**
 * Most recent jobs visible to the caller. A non-null organizationId / createdBy is always applied as a filter;
 * the route decides the scope (lib/tenant-guard: client -> own org).
 */
export async function listRecentJobs(
  scope: { organizationId: string | null; createdBy: string | null },
  limit = 10,
  opts: { now?: number; runStatus?: RunStatusLookup } = {},
): Promise<StoredBatchJob[]> {
  const now = opts.now ?? Date.now();
  const client = db();
  let q = client.from(JOBS).select("*");
  if (scope.organizationId) q = q.eq("organization_id", scope.organizationId);
  if (scope.createdBy) q = q.eq("created_by", scope.createdBy);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
  if (error) throw new BatchStoreUnavailableError(`batch_store_read_failed: ${error.message}`);
  const rows = (data ?? []) as JobRow[];
  const cards = await readCards(client, rows.map((r) => r.id));
  // Same derivation as getJob (incl. the Trigger run status), so the list never shows a failed run as running.
  return Promise.all(rows.map(async (r) => {
    let job = summarizeBatch(r, cards, now);
    if (!TERMINAL.has(job.state) && r.run_id && opts.runStatus) {
      const runStatus = await opts.runStatus(r.run_id).catch(() => null);
      job = summarizeBatch(r, cards, now, runStatus);
    }
    await persistTerminal(client, r, job);
    return job;
  }));
}
