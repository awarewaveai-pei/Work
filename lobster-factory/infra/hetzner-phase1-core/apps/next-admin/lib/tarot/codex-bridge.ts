/**
 * Codex image jobs: the operator's own laptop draws them with her ChatGPT plan's Codex allowance (no per-image bill).
 * The laptop runs scripts/codex-image-worker.mjs, which long-polls POST /api/internal/codex-images/claim and posts the
 * picture to .../complete (Bearer CODEX_WORKER_SECRET). The server never reaches the laptop: the laptop always dials out.
 *
 * Kept in process memory on purpose: the request waiting for the picture lives in this same process, so a job can never
 * outlive its caller -- a restart ends both, and nothing was charged (Codex costs 0). A DB row would only add jobs whose
 * caller is already gone. Held on globalThis so every route bundle that imports this module sees the same queue.
 *
 * Only the operator may use it (her personal plan, not a service for others): see codexAllowed().
 */

/** A worker that has not asked for work for this long is treated as offline: callers fail fast instead of waiting. */
export const WORKER_STALE_MS = 45_000;
/** The longest one claim request is held open (below Cloudflare's 100 s and the worker's own fetch timeout). */
export const CLAIM_WAIT_MAX_MS = 25_000;
/** A claimed job not completed in this long is given up (Codex took 47-115 s per image, measured 2026-11-14/15). */
const RUN_LEASE_MS = 4 * 60_000;
/** How long a caller waits for its picture, queue included: under Cloudflare's ~100 s edge cut (image-gen.ts timeoutMs). */
export const CODEX_WAIT_MS = 90_000;
/** A job whose caller has less than this left is not handed out: Codex never drew one faster (47 s measured), so it would
 *  only spend the plan's allowance on a picture nobody receives. */
export const MIN_DRAW_MS = 45_000;
/** Worker errors after which it stops itself (scripts/codex-image-worker.mjs exits): it is offline at once. */
const WORKER_STOPS_ON = new Set(["codex_quota_exhausted"]);

export interface CodexRef { mime: string; b64: string }
export interface CodexJobInput { prompt: string; aspectRatio: string; refs: CodexRef[] }
/** timeLeftMs: how long the caller still waits; the worker stops drawing after it (nobody would receive the picture). */
export interface ClaimedCodexJob extends CodexJobInput { id: string; timeLeftMs: number }
/** What one picture cost the plan, read by the worker from Codex's own session record (written to the AI Costs ledger). */
export interface CodexUsage {
  codex_input_tokens?: number; codex_cached_input_tokens?: number; codex_output_tokens?: number;
  /** % of the plan's 5-hour / weekly Codex allowance used after this picture, and when each window resets (unix s). */
  codex_5h_used_pct?: number; codex_5h_resets_at?: number; codex_week_used_pct?: number; codex_week_resets_at?: number;
}
export const CODEX_USAGE_KEYS = ["codex_input_tokens", "codex_cached_input_tokens", "codex_output_tokens", "codex_5h_used_pct",
  "codex_5h_resets_at", "codex_week_used_pct", "codex_week_resets_at"] as const satisfies readonly (keyof CodexUsage)[];
export type CodexOutcome = { ok: true; image: string; usage?: CodexUsage } | { ok: false; error: string };

interface Job extends CodexJobInput {
  id: string;
  resolve: (r: CodexOutcome) => void;
  claimedAt: number | null;
  deadlineAt: number;
}

interface Bridge { queue: Job[]; running: Map<string, Job>; lastPollAt: number; wake: Set<() => void> }
const KEY = Symbol.for("awarewave.codexImageBridge");
function bridge(): Bridge {
  const g = globalThis as unknown as Record<symbol, Bridge | undefined>;
  return (g[KEY] ??= { queue: [], running: new Map(), lastPollAt: 0, wake: new Set() });
}

/** True only for the operator acting herself: `ops:<role>:<CODEX_IMAGE_OWNER_USER_ID>`. Unset id = nobody (fail closed). */
export function codexAllowed(actor: string, env: Record<string, string | undefined> = process.env): boolean {
  const owner = env.CODEX_IMAGE_OWNER_USER_ID?.trim();
  return !!owner && actor.startsWith("ops:") && actor.endsWith(`:${owner}`);
}

/** Online = polled recently, or busy drawing a job it claimed within the lease (one picture takes up to ~2 min, longer
 *  than WORKER_STALE_MS, and the worker does not poll while it draws). */
export function workerOnline(now = Date.now()): boolean {
  const b = bridge();
  if (now - b.lastPollAt < WORKER_STALE_MS) return true;
  for (const job of b.running.values()) if (job.claimedAt !== null && now - job.claimedAt <= RUN_LEASE_MS) return true;
  return false;
}

function expireStale(now: number): void {
  const b = bridge();
  for (const [id, job] of b.running) {
    if (job.claimedAt !== null && now - job.claimedAt > RUN_LEASE_MS) {
      b.running.delete(id);
      job.resolve({ ok: false, error: "codex_worker_timeout" });
    }
  }
}

/** Queue one picture and wait for the laptop. Resolves with codex_worker_offline at once when no worker is polling. */
/** deadlineAt: when the caller stops waiting (its own timer); defaults to now + CODEX_WAIT_MS. */
export function runOnLaptop(input: CodexJobInput, signal: AbortSignal, now = Date.now(), deadlineAt = now + CODEX_WAIT_MS): Promise<CodexOutcome> {
  if (!workerOnline(now)) return Promise.resolve({ ok: false, error: "codex_worker_offline" });
  const b = bridge();
  return new Promise<CodexOutcome>((resolve) => {
    let settled = false;
    const job: Job = {
      ...input, id: crypto.randomUUID(), claimedAt: null, deadlineAt,
      resolve: (r) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        resolve(r);
      },
    };
    // The caller gave up (its own timeout): drop the job so a late picture is not attached to nothing.
    const onAbort = () => {
      b.queue = b.queue.filter((j) => j !== job);
      b.running.delete(job.id);
      job.resolve({ ok: false, error: "generation_timeout" });
    };
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort);
    b.queue.push(job);
    for (const w of b.wake) w();
  });
}

/** Worker side: the oldest waiting job, or null after waitMs with none. Every call marks the worker online. */
export async function claimJob(waitMs: number, now: () => number = Date.now): Promise<ClaimedCodexJob | null> {
  const b = bridge();
  b.lastPollAt = now();
  expireStale(now());
  const take = (): ClaimedCodexJob | null => {
    let job = b.queue.shift();
    // Waited behind another picture until too late to draw this one in time: tell its caller now, spend nothing.
    while (job && job.deadlineAt - now() < MIN_DRAW_MS) {
      job.resolve({ ok: false, error: "codex_worker_busy" });
      job = b.queue.shift();
    }
    if (!job) return null;
    job.claimedAt = now();
    b.running.set(job.id, job);
    const { id, prompt, aspectRatio, refs } = job;
    return { id, prompt, aspectRatio, refs, timeLeftMs: job.deadlineAt - now() };
  };
  const first = take();
  if (first || waitMs <= 0) return first;
  await new Promise<void>((resolve) => {
    const done = () => { clearTimeout(timer); b.wake.delete(done); resolve(); };
    const timer = setTimeout(done, Math.min(waitMs, CLAIM_WAIT_MAX_MS));
    b.wake.add(done);
  });
  b.lastPollAt = now();
  return take();
}

/** Worker side: hand back a claimed job's picture (PNG/JPEG/WebP data URL) or its error. false = unknown or expired id. */
export function completeJob(id: string, outcome: CodexOutcome): boolean {
  const b = bridge();
  // The worker just answered: alive until its next claim -- unless that answer is one it stops itself after. Then it is
  // offline for everyone: new callers (workerOnline) and the ones already queued, who hear the same reason now. This
  // holds even when the answered job's own caller already timed out (the worker learns of that only by its 404).
  if ("error" in outcome && WORKER_STOPS_ON.has(outcome.error)) {
    b.lastPollAt = 0;
    for (const queued of b.queue.splice(0)) queued.resolve({ ok: false, error: outcome.error });
  } else {
    b.lastPollAt = Date.now();
  }
  const job = b.running.get(id);
  if (!job) return false;
  b.running.delete(id);
  job.resolve(outcome);
  return true;
}

/** Tests only. */
export function resetCodexBridgeForTests(): void {
  const b = bridge();
  b.queue = []; b.running.clear(); b.lastPollAt = 0; b.wake.clear();
}
