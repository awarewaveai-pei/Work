/**
 * Codex image jobs: the operator's own laptop draws them with her ChatGPT plan's Codex allowance (no per-image bill).
 * The laptop runs scripts/codex-image-worker.mjs, which long-polls POST /api/internal/codex-images/claim and posts the
 * picture to .../complete (Bearer CODEX_WORKER_SECRET). The server never reaches the laptop: the laptop always dials out.
 *
 * No browser request waits for a picture (Cloudflare cuts a response not started within ~100 s; Codex takes 47-115 s):
 * a route that runs Codex hands its whole tail to deferCodexWork, answers 202 + X-Codex-Job at once, and the browser
 * polls GET /api/tools/codex-laptop/jobs/<id> (public/editor-shared/codex-wait.js) for the response the route would have
 * sent. generateCodex refuses to run outside deferCodexWork (codex_not_deferred), so no caller can wait in-request.
 *
 * Kept in process memory on purpose: a restart ends the job and its result together, and nothing was charged (Codex
 * costs 0); the poll then answers codex_job_gone. Held on globalThis so every route bundle sees the same queue.
 *
 * Only the operator may use it (her personal plan, not a service for others): see codexAllowed().
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { friendlyImageError } from "@/lib/studio/image-errors";

/** A worker that has not asked for work for this long is treated as offline: callers fail fast instead of waiting. */
export const WORKER_STALE_MS = 45_000;
/** The longest one claim request is held open (below Cloudflare's 100 s and the worker's own fetch timeout). */
export const CLAIM_WAIT_MAX_MS = 25_000;
/** A queued job the laptop has not taken in this long fails (codex_worker_busy, or offline if it stopped polling). */
export const QUEUE_WAIT_MS = 4 * 60_000;
/** A claimed job not completed in this long is given up (Codex took 47-115 s per image, measured 2026-11-14/15). The
 *  worker is told this as timeLeftMs and stops drawing after it. */
export const RUN_LEASE_MS = 4 * 60_000;
/** Backstop for the whole call (image-gen.ts timeoutMs): the queue and lease timers above always settle first. */
export const CODEX_JOB_MS = QUEUE_WAIT_MS + RUN_LEASE_MS + 30_000;
/** A finished result waits this long for its poll, then is dropped (taken = dropped at once). */
export const RESULT_TTL_MS = 10 * 60_000;
/** The 202 answer's header naming the job to poll (public/editor-shared/codex-wait.js reads the same name). */
export const CODEX_JOB_HEADER = "X-Codex-Job";
/** Worker errors after which it stops itself (scripts/codex-image-worker.mjs exits): it is offline at once. */
const WORKER_STOPS_ON = new Set(["codex_quota_exhausted"]);

export interface CodexRef { mime: string; b64: string }
export interface CodexJobInput { prompt: string; aspectRatio: string; refs: CodexRef[] }
/** timeLeftMs: the lease; the worker stops drawing after it (nobody would receive the picture). */
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
  /** The queue-wait timer, then the lease timer: whichever stage the job is in. */
  timer: ReturnType<typeof setTimeout> | null;
}
/** A route's deferred tail: who asked (only they may take it) and the response it produced, once done. */
interface Deferred { actor: string; result: { status: number; body: unknown } | null; doneAt: number }

interface Bridge { queue: Job[]; running: Map<string, Job>; lastPollAt: number; wake: Set<() => void>; deferred: Map<string, Deferred> }
const KEY = Symbol.for("awarewave.codexImageBridge");
function bridge(): Bridge {
  const g = globalThis as unknown as Record<symbol, Bridge | undefined>;
  const b = (g[KEY] ??= { queue: [], running: new Map(), lastPollAt: 0, wake: new Set(), deferred: new Map() });
  b.deferred ??= new Map(); // a bridge made before deferral existed (same process across a hot reload)
  return b;
}
const deferredScope = new AsyncLocalStorage<true>();

/** True only for the operator acting herself: `ops:<role>:<CODEX_IMAGE_OWNER_USER_ID>`. Unset id = nobody (fail closed). */
export function codexAllowed(actor: string, env: Record<string, string | undefined> = process.env): boolean {
  const owner = env.CODEX_IMAGE_OWNER_USER_ID?.trim();
  return !!owner && actor.startsWith("ops:") && actor.endsWith(`:${owner}`);
}

/** Online = polled recently, or busy drawing a job it claimed (the worker does not poll while it draws; the lease timer
 *  removes a job whose worker never answers). */
export function workerOnline(now = Date.now()): boolean {
  const b = bridge();
  if (now - b.lastPollAt < WORKER_STALE_MS) return true;
  for (const job of b.running.values()) if (job.claimedAt !== null && now - job.claimedAt <= RUN_LEASE_MS) return true;
  return false;
}

/** Is this call running inside deferCodexWork (so no browser request is waiting on it)? */
export function codexDeferred(): boolean {
  return deferredScope.getStore() === true;
}

/** Queue one picture and wait for the laptop. Resolves with codex_worker_offline at once when no worker is polling.
 *  Settles by itself: not taken within QUEUE_WAIT_MS, or not answered within RUN_LEASE_MS of being taken. */
export function runOnLaptop(input: CodexJobInput, signal: AbortSignal): Promise<CodexOutcome> {
  if (!workerOnline()) return Promise.resolve({ ok: false, error: "codex_worker_offline" });
  const b = bridge();
  return new Promise<CodexOutcome>((resolve) => {
    let settled = false;
    const job: Job = {
      ...input, id: crypto.randomUUID(), claimedAt: null, timer: null,
      resolve: (r) => {
        if (settled) return;
        settled = true;
        if (job.timer) clearTimeout(job.timer);
        signal.removeEventListener("abort", onAbort);
        resolve(r);
      },
    };
    // The backstop fired (image-gen.ts CODEX_JOB_MS): drop the job so a late picture is not attached to nothing.
    const onAbort = () => {
      b.queue = b.queue.filter((j) => j !== job);
      b.running.delete(job.id);
      job.resolve({ ok: false, error: "codex_timeout" });
    };
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort);
    job.timer = setTimeout(() => {
      if (!b.queue.includes(job)) return;
      b.queue = b.queue.filter((j) => j !== job);
      job.resolve({ ok: false, error: workerOnline() ? "codex_worker_busy" : "codex_worker_offline" });
    }, QUEUE_WAIT_MS);
    b.queue.push(job);
    for (const w of b.wake) w();
  });
}

/** Worker side: the oldest waiting job, or null after waitMs with none. Every call marks the worker online. */
export async function claimJob(waitMs: number): Promise<ClaimedCodexJob | null> {
  const b = bridge();
  b.lastPollAt = Date.now();
  const take = (): ClaimedCodexJob | null => {
    const job = b.queue.shift();
    if (!job) return null;
    if (job.timer) clearTimeout(job.timer);
    job.claimedAt = Date.now();
    b.running.set(job.id, job);
    job.timer = setTimeout(() => {
      if (b.running.get(job.id) !== job) return;
      b.running.delete(job.id);
      job.resolve({ ok: false, error: "codex_worker_timeout" });
    }, RUN_LEASE_MS);
    const { id, prompt, aspectRatio, refs } = job;
    return { id, prompt, aspectRatio, refs, timeLeftMs: RUN_LEASE_MS };
  };
  const first = take();
  if (first || waitMs <= 0) return first;
  await new Promise<void>((resolve) => {
    const done = () => { clearTimeout(timer); b.wake.delete(done); resolve(); };
    const timer = setTimeout(done, Math.min(waitMs, CLAIM_WAIT_MAX_MS));
    b.wake.add(done);
  });
  b.lastPollAt = Date.now();
  return take();
}

/** Worker side: the worker is stopping (idle). Offline at once, and anything queued since its last claim fails fast
 *  (otherwise new pictures would be queued for a worker that is gone, each waiting QUEUE_WAIT_MS). */
export function workerLeft(): void {
  const b = bridge();
  b.lastPollAt = 0;
  for (const job of b.queue.splice(0)) job.resolve({ ok: false, error: "codex_worker_offline" });
}

/** Worker side: hand back a claimed job's picture (PNG/JPEG/WebP data URL) or its error. false = unknown or expired id. */
export function completeJob(id: string, outcome: CodexOutcome): boolean {
  const b = bridge();
  // The worker just answered: alive until its next claim -- unless that answer is one it stops itself after. Then it is
  // offline for everyone: new callers (workerOnline) and the ones already queued, who hear the same reason now. This
  // holds even when the answered job already expired (the worker learns of that only by its 404).
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

function sweepResults(now: number): void {
  const { deferred } = bridge();
  for (const [id, d] of deferred) if (d.result && now - d.doneAt > RESULT_TTL_MS) deferred.delete(id);
}

/** Run a route's tail (generation + whatever it does with the picture) detached from the request, and answer 202 with
 *  the job id at once. The tail's own Response is kept for takeCodexResult. Cost logging stays inside the tail, so it
 *  happens once however often the browser polls. */
export function deferCodexWork(actor: string, work: () => Promise<Response>): Response {
  sweepResults(Date.now());
  const id = crypto.randomUUID();
  const entry: Deferred = { actor, result: null, doneAt: 0 };
  bridge().deferred.set(id, entry);
  const failed = { status: 200, body: { ok: false, error: friendlyImageError("codex_failed"), code: "codex_failed" } as unknown };
  void deferredScope.run(true, work)
    .then(async (res) => ({ status: res.status, body: (await res.json().catch(() => failed.body)) as unknown }), () => failed)
    .then((result) => { entry.result = result; entry.doneAt = Date.now(); });
  return Response.json({ pending: true, codexJob: id }, { status: 202, headers: { [CODEX_JOB_HEADER]: id, "Cache-Control": "no-store" } });
}

/** A route that can run Codex: defer its tail when it will (owner + codex-image), else run it in the request as before.
 *  A non-owner is not deferred, so generateCodex answers codex_operator_only at once. */
export function deferIfCodex(model: unknown, actor: string, work: () => Promise<Response>): Promise<Response> {
  return model === "codex-image" && codexAllowed(actor) ? Promise.resolve(deferCodexWork(actor, work)) : work();
}

export type CodexResult = { state: "unknown" } | { state: "running" } | { state: "done"; status: number; body: unknown };
/** The poll: only the actor who started the job may see it (anyone else: unknown, not "exists"). Taken = dropped. */
export function takeCodexResult(id: string, actor: string): CodexResult {
  sweepResults(Date.now());
  const { deferred } = bridge();
  const entry = deferred.get(id);
  if (!entry || entry.actor !== actor) return { state: "unknown" };
  if (!entry.result) return { state: "running" };
  deferred.delete(id);
  return { state: "done", ...entry.result };
}

/** Tests only. */
export function resetCodexBridgeForTests(): void {
  const b = bridge();
  for (const job of [...b.queue, ...b.running.values()]) if (job.timer) clearTimeout(job.timer);
  b.queue = []; b.running.clear(); b.lastPollAt = 0; b.wake.clear(); b.deferred.clear();
}
