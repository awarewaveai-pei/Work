/**
 * Subscription worker bridge: jobs that run on a ChatGPT / Claude subscription instead of the paid API, drawn by a
 * worker that always dials out (scripts/codex-image-worker.mjs long-polls POST /api/internal/codex-images/claim and
 * answers on .../complete). The server never reaches a worker. Two job kinds share one queue: "image" (Codex picture,
 * the original use) and "text" (system + prompt -> plain text, Codex or Claude CLI with no tools).
 *
 * Two lanes, decided by WHICH secret authenticated the worker (worker-auth.ts), never by what the worker says:
 * "owner" = the operator's laptop (CODEX_WORKER_SECRET), serving only the operator acting herself (codexAllowed);
 * "schedule" = the host worker (SUB_WORKER_HOST_SECRET), for scheduled runs (PLAN I2). A lane runs the tools its
 * worker reports on claim; neither lane can take or answer the other's jobs.
 *
 * No browser request waits for a worker (Cloudflare cuts a response not started within ~100 s; Codex takes 47-115 s):
 * a route that runs one hands its tail to deferCodexWork, answers 202 + X-Codex-Job at once, and the browser polls
 * GET /api/tools/codex-laptop/jobs/<id> (public/editor-shared/codex-wait.js). generateCodex refuses to run outside
 * deferCodexWork (codex_not_deferred).
 *
 * A spent allowance is a state of one plan, so it blocks a lane's TOOL for pictures and text alike until its reset
 * time; callers get codex_quota_exhausted / sub_quota_exhausted at once (PLAN I7). A text answer keeps the worker
 * online; a picture answer also keeps the original behaviour (the worker counts as gone; old workers exit on it).
 * A worker that claims without a `tools` list is an old picture-only worker: it never gets a text job.
 *
 * Kept in process memory on purpose: a restart ends the job and its result together, and nothing was charged
 * (subscriptions cost 0); the poll then answers codex_job_gone. Held on globalThis so every route bundle sees it.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { friendlyImageError } from "@/lib/studio/image-errors";

/** A worker that has not asked for work for this long is treated as offline: callers fail fast instead of waiting. */
export const WORKER_STALE_MS = 45_000;
/** The longest one claim request is held open (below Cloudflare's 100 s and the worker's own fetch timeout). */
export const CLAIM_WAIT_MAX_MS = 25_000;
/** A queued job the worker has not taken in this long fails (…_worker_busy, or offline if it stopped polling). */
export const QUEUE_WAIT_MS = 4 * 60_000;
/** A claimed job not completed in this long is given up (Codex took 47-115 s per image, measured 2026-11-14/15). The
 *  worker is told this as timeLeftMs and stops after it. */
export const RUN_LEASE_MS = 4 * 60_000;
/** Backstop for the whole call (image-gen.ts timeoutMs): the queue and lease timers above always settle first. */
export const CODEX_JOB_MS = QUEUE_WAIT_MS + RUN_LEASE_MS + 30_000;
/** A finished result waits this long for its poll, then is dropped (taken = dropped at once). */
export const RESULT_TTL_MS = 10 * 60_000;
/** The 202 answer's header naming the job to poll (public/editor-shared/codex-wait.js reads the same name). */
export const CODEX_JOB_HEADER = "X-Codex-Job";
/** A spent text allowance with no reset time from the worker blocks its tool this long (the plans' 5-hour window). */
export const QUOTA_BLOCK_DEFAULT_MS = 5 * 60 * 60_000;
/** Worker errors that mean "this plan's allowance is spent". */
const QUOTA_ERRORS = new Set(["codex_quota_exhausted", "sub_quota_exhausted"]);

export type SubTool = "codex" | "claude";
export type SubLane = "owner" | "schedule";
export const SUB_TOOLS: readonly SubTool[] = ["codex", "claude"];

export interface CodexRef { mime: string; b64: string }
export interface CodexJobInput { prompt: string; aspectRatio: string; refs: CodexRef[] }
/** One text job: the CLI runs `system` + `prompt` with no tools and answers plain text. cliModel null = the CLI's own default. */
export interface SubTextJobInput { tool: SubTool; lane: SubLane; cliModel: string | null; system: string; prompt: string }
/** timeLeftMs: the lease; the worker stops after it (nobody would receive the answer). A job with no `kind` = image (old worker). */
export type ClaimedCodexJob = CodexJobInput & { id: string; kind: "image"; timeLeftMs: number };
export type ClaimedTextJob = { id: string; kind: "text"; tool: SubTool; cliModel: string | null; system: string; prompt: string; timeLeftMs: number };
export type ClaimedJob = ClaimedCodexJob | ClaimedTextJob;
/** What one picture cost the plan, read by the worker from Codex's own session record (written to the AI Costs ledger). */
export interface CodexUsage {
  codex_input_tokens?: number; codex_cached_input_tokens?: number; codex_output_tokens?: number;
  /** % of the plan's 5-hour / weekly Codex allowance used after this picture, and when each window resets (unix s). */
  codex_5h_used_pct?: number; codex_5h_resets_at?: number; codex_week_used_pct?: number; codex_week_resets_at?: number;
}
export const CODEX_USAGE_KEYS = ["codex_input_tokens", "codex_cached_input_tokens", "codex_output_tokens", "codex_5h_used_pct",
  "codex_5h_resets_at", "codex_week_used_pct", "codex_week_resets_at"] as const satisfies readonly (keyof CodexUsage)[];
/** A text job's usage: Codex's fields as for pictures, plus Claude's plain token counts. */
export interface SubTextUsage extends CodexUsage { input_tokens?: number; output_tokens?: number }
export const SUB_TEXT_USAGE_KEYS = [...CODEX_USAGE_KEYS, "input_tokens", "output_tokens"] as const satisfies readonly (keyof SubTextUsage)[];
export type CodexOutcome = { ok: true; image: string; usage?: CodexUsage } | { ok: false; error: string };
/** quotaResetsAt: epoch ms the tool's allowance comes back (on sub_quota_exhausted). */
export type SubTextOutcome =
  | { ok: true; text: string; usage?: SubTextUsage; answeredModel?: string }
  | { ok: false; error: string; quotaResetsAt?: number };
/** What a worker hands back on .../complete. */
export type WorkerAnswer =
  | { ok: true; image: string; usage?: CodexUsage }
  | { ok: true; text: string; usage?: SubTextUsage; answeredModel?: string }
  | { ok: false; error: string; quotaResetsAt?: number; tool?: SubTool };
type JobKind = "image" | "text";

/** Error codes per kind: the image ones are what callers and pages already know. */
interface Codes { abort: string; busy: string; offline: string; lease: string }
const IMAGE_CODES: Codes = { abort: "codex_timeout", busy: "codex_worker_busy", offline: "codex_worker_offline", lease: "codex_worker_timeout" };
const TEXT_CODES: Codes = { abort: "sub_worker_timeout", busy: "sub_worker_busy", offline: "sub_worker_offline", lease: "sub_worker_timeout" };

interface JobCore {
  id: string;
  lane: SubLane;
  tool: SubTool;
  codes: Codes;
  claimedAt: number | null;
  /** The queue-wait timer, then the lease timer: whichever stage the job is in. */
  timer: ReturnType<typeof setTimeout> | null;
  /** Settle with { ok: false, error } (once; later calls are ignored). */
  fail: (error: string, quotaResetsAt?: number) => void;
}
interface ImageJob extends JobCore, CodexJobInput { kind: "image"; resolve: (r: CodexOutcome) => void }
interface TextJob extends JobCore { kind: "text"; cliModel: string | null; system: string; prompt: string; resolve: (r: SubTextOutcome) => void }
type Job = ImageJob | TextJob;

/** One lane's worker as last heard: tools it can run, whether it runs text jobs (false = an old picture-only worker),
 *  and per tool until when its allowance is spent (epoch ms). */
interface Worker { lastPollAt: number; tools: SubTool[]; text: boolean; quotaBlockedUntil: Partial<Record<SubTool, number>> }
/** A route's deferred tail: who asked (only they may take it) and the response it produced, once done. */
interface Deferred { actor: string; result: { status: number; body: unknown } | null; doneAt: number }

interface Bridge { queue: Job[]; running: Map<string, Job>; workers: Record<SubLane, Worker>; wake: Set<() => void>; deferred: Map<string, Deferred> }
const KEY = Symbol.for("awarewave.codexImageBridge");
const noWorker = (): Worker => ({ lastPollAt: 0, tools: [], text: false, quotaBlockedUntil: {} });
function bridge(): Bridge {
  const g = globalThis as unknown as Record<symbol, Bridge | undefined>;
  const b = (g[KEY] ??= { queue: [], running: new Map(), workers: { owner: noWorker(), schedule: noWorker() }, wake: new Set(), deferred: new Map() });
  // A bridge made by an older build in the same process (hot reload): add what it lacks.
  b.deferred ??= new Map();
  b.workers ??= { owner: noWorker(), schedule: noWorker() };
  return b;
}
const deferredScope = new AsyncLocalStorage<true>();

/** True only for the operator acting herself: `ops:<role>:<CODEX_IMAGE_OWNER_USER_ID>`. Unset id = nobody (fail closed). */
export function codexAllowed(actor: string, env: Record<string, string | undefined> = process.env): boolean {
  const owner = env.CODEX_IMAGE_OWNER_USER_ID?.trim();
  return !!owner && actor.startsWith("ops:") && actor.endsWith(`:${owner}`);
}

/** The lane's worker polled recently, or is busy on a job it claimed (it does not poll while it works; the lease timer
 *  removes a job whose worker never answers). */
function laneAlive(lane: SubLane, now: number): boolean {
  const b = bridge();
  if (now - b.workers[lane].lastPollAt < WORKER_STALE_MS) return true;
  for (const job of b.running.values()) {
    if (job.lane === lane && job.claimedAt !== null && now - job.claimedAt <= RUN_LEASE_MS) return true;
  }
  return false;
}

/** Until when the lane's tool is blocked for a spent allowance (epoch ms), or null. An expired block is cleared here. */
function quotaBlocked(lane: SubLane, tool: SubTool, now: number): number | null {
  const w = bridge().workers[lane];
  const until = w.quotaBlockedUntil[tool];
  if (until === undefined) return null;
  if (until > now) return until;
  delete w.quotaBlockedUntil[tool];
  return null;
}

/** Online = the lane's worker is alive and can run this tool for this kind of job. Defaults = the laptop drawing Codex pictures. */
export function workerOnline(lane: SubLane = "owner", tool: SubTool = "codex", kind: JobKind = "image", now = Date.now()): boolean {
  const w = bridge().workers[lane];
  return w.tools.includes(tool) && (kind === "image" || w.text) && laneAlive(lane, now);
}

/** A spent allowance blocks the lane's tool until `until`: every job queued for it fails now, each kind with its own code. */
function blockTool(lane: SubLane, tool: SubTool, until: number): void {
  bridge().workers[lane].quotaBlockedUntil[tool] = until;
  for (const queued of dropQueued((j) => j.lane === lane && j.tool === tool)) {
    if (queued.kind === "image") queued.fail("codex_quota_exhausted");
    else queued.fail("sub_quota_exhausted", until);
  }
}

/** What each lane's worker can do right now (for the model buttons and the costs page). */
export function subWorkerStatus(now = Date.now()): Record<SubLane, { online: boolean; tools: SubTool[]; text: boolean; quotaBlockedUntil: Partial<Record<SubTool, number>> }> {
  const b = bridge();
  const one = (lane: SubLane) => {
    const quotaBlockedUntil: Partial<Record<SubTool, number>> = {};
    for (const tool of SUB_TOOLS) { const until = quotaBlocked(lane, tool, now); if (until !== null) quotaBlockedUntil[tool] = until; }
    return { online: laneAlive(lane, now), tools: [...b.workers[lane].tools], text: b.workers[lane].text, quotaBlockedUntil };
  };
  return { owner: one("owner"), schedule: one("schedule") };
}

/** Is this call running inside deferCodexWork (so no browser request is waiting on it)? */
export function codexDeferred(): boolean {
  return deferredScope.getStore() === true;
}

function dropQueued(match: (job: Job) => boolean): Job[] {
  const b = bridge();
  const dropped = b.queue.filter(match);
  b.queue = b.queue.filter((job) => !match(job));
  return dropped;
}

/** Queue one job and settle with its outcome: not taken within QUEUE_WAIT_MS, not answered within RUN_LEASE_MS of
 *  being taken, or its caller's signal aborted -- whichever comes first. `build` makes the job around `settle`. */
function enqueue<O>(signal: AbortSignal, build: (settle: (r: O) => void) => Job): Promise<O> {
  const b = bridge();
  return new Promise<O>((resolve) => {
    let settled = false;
    const settle = (r: O) => {
      if (settled) return;
      settled = true;
      if (job.timer) clearTimeout(job.timer);
      signal.removeEventListener("abort", onAbort);
      resolve(r);
    };
    const job = build(settle);
    // The backstop fired (image-gen.ts CODEX_JOB_MS / the caller's own): drop the job so a late answer is attached to nothing.
    const onAbort = () => {
      dropQueued((j) => j === job);
      b.running.delete(job.id);
      job.fail(job.codes.abort);
    };
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort);
    job.timer = setTimeout(() => {
      if (!b.queue.includes(job)) return;
      dropQueued((j) => j === job);
      job.fail(workerOnline(job.lane, job.tool, job.kind) ? job.codes.busy : job.codes.offline);
    }, QUEUE_WAIT_MS);
    b.queue.push(job);
    for (const w of b.wake) w();
  });
}

/** Queue one picture for the laptop. Resolves at once with codex_worker_offline when no worker is polling, or
 *  codex_quota_exhausted while the plan's Codex allowance is spent. */
export function runOnLaptop(input: CodexJobInput, signal: AbortSignal): Promise<CodexOutcome> {
  if (!workerOnline("owner", "codex")) return Promise.resolve({ ok: false, error: "codex_worker_offline" });
  if (quotaBlocked("owner", "codex", Date.now()) !== null) return Promise.resolve({ ok: false, error: "codex_quota_exhausted" });
  return enqueue<CodexOutcome>(signal, (settle) => ({
    ...input, kind: "image", lane: "owner", tool: "codex", codes: IMAGE_CODES,
    id: crypto.randomUUID(), claimedAt: null, timer: null,
    resolve: settle, fail: (error) => settle({ ok: false, error }),
  }));
}

/** Queue one text job on its lane. Fails at once, without queueing: no worker on the lane that runs text with the
 *  tool (sub_worker_offline), or the tool's allowance spent (sub_quota_exhausted). */
export function runSubJob(input: SubTextJobInput, signal: AbortSignal): Promise<SubTextOutcome> {
  const { lane, tool } = input;
  if (!workerOnline(lane, tool, "text")) return Promise.resolve({ ok: false, error: "sub_worker_offline" });
  const blockedUntil = quotaBlocked(lane, tool, Date.now());
  if (blockedUntil !== null) return Promise.resolve({ ok: false, error: "sub_quota_exhausted", quotaResetsAt: blockedUntil });
  return enqueue<SubTextOutcome>(signal, (settle) => ({
    kind: "text", lane, tool, cliModel: input.cliModel, system: input.system, prompt: input.prompt, codes: TEXT_CODES,
    id: crypto.randomUUID(), claimedAt: null, timer: null,
    resolve: settle, fail: (error, quotaResetsAt) => settle(quotaResetsAt === undefined ? { ok: false, error } : { ok: false, error, quotaResetsAt }),
  }));
}

/** Worker side: the oldest waiting job this worker may take (its lane, a tool it runs, not blocked for allowance;
 *  text only if it sent a tools list), or null after waitMs with none. Every call marks the lane's worker online.
 *  tools undefined = an old picture-only worker (no tools list in its claim): Codex pictures only. */
export async function claimJob(waitMs: number, lane: SubLane = "owner", tools?: readonly SubTool[]): Promise<ClaimedJob | null> {
  const b = bridge();
  const worker = b.workers[lane];
  worker.tools = tools ? SUB_TOOLS.filter((t) => tools.includes(t)) : ["codex"];
  worker.text = !!tools;
  worker.lastPollAt = Date.now();
  const take = (): ClaimedJob | null => {
    const now = Date.now();
    const at = b.queue.findIndex((j) => j.lane === lane && worker.tools.includes(j.tool) && (j.kind === "image" || worker.text)
      && quotaBlocked(lane, j.tool, now) === null);
    if (at < 0) return null;
    const [job] = b.queue.splice(at, 1);
    if (job.timer) clearTimeout(job.timer);
    job.claimedAt = now;
    b.running.set(job.id, job);
    job.timer = setTimeout(() => {
      if (b.running.get(job.id) !== job) return;
      b.running.delete(job.id);
      job.fail(job.codes.lease);
    }, RUN_LEASE_MS);
    if (job.kind === "image") {
      const { id, prompt, aspectRatio, refs } = job;
      return { id, kind: "image", prompt, aspectRatio, refs, timeLeftMs: RUN_LEASE_MS };
    }
    const { id, tool, cliModel, system, prompt } = job;
    return { id, kind: "text", tool, cliModel, system, prompt, timeLeftMs: RUN_LEASE_MS };
  };
  const deadline = Date.now() + Math.min(Math.max(waitMs, 0), CLAIM_WAIT_MAX_MS);
  for (;;) {
    const job = take();
    if (job) return job;
    const left = deadline - Date.now();
    if (left <= 0) return null;
    // Woken by any new job (another lane's too): look again until the deadline.
    await new Promise<void>((resolve) => {
      const done = () => { clearTimeout(timer); b.wake.delete(done); resolve(); };
      const timer = setTimeout(done, left);
      b.wake.add(done);
    });
    worker.lastPollAt = Date.now();
  }
}

/** Worker side: the lane's worker is stopping (idle). Offline at once, and anything queued for it fails fast
 *  (otherwise new jobs would be queued for a worker that is gone, each waiting QUEUE_WAIT_MS). */
export function workerLeft(lane: SubLane = "owner"): void {
  bridge().workers[lane].lastPollAt = 0;
  for (const job of dropQueued((j) => j.lane === lane)) job.fail(job.codes.offline);
}

/** Worker side: hand back a claimed job's answer or its error. false = unknown or expired id, or a job of another lane
 *  (a worker answers only its own lane's jobs). */
export function completeJob(id: string, answer: WorkerAnswer, lane: SubLane = "owner"): boolean {
  const b = bridge();
  const worker = b.workers[lane];
  const now = Date.now();
  const running = b.running.get(id);
  const job = running && running.lane === lane ? running : undefined;
  const failure = "error" in answer ? answer : null;
  const quota = !!failure && QUOTA_ERRORS.has(failure.error);

  // A spent allowance blocks the tool for pictures and text alike. The tool is the job's; for a job already gone, the
  // one the worker names, else (old worker) a picture error means Codex.
  const quotaTool = job?.tool ?? failure?.tool ?? (failure?.error === "codex_quota_exhausted" ? "codex" : undefined);
  const until = failure?.quotaResetsAt ?? now + QUOTA_BLOCK_DEFAULT_MS;
  if (quota && quotaTool) blockTool(lane, quotaTool, until);
  // After a spent picture allowance the worker stops itself (old workers exit on it), so it is offline for everyone at
  // once. This holds even when the answered job already expired (the worker learns of that only by its 404).
  const stops = quota && (job ? job.kind === "image" : failure?.error === "codex_quota_exhausted");
  worker.lastPollAt = stops ? 0 : now; // else it just answered: alive until its next claim
  if (!job) return false;
  b.running.delete(id);
  if (failure && quota) job.fail(job.kind === "image" ? "codex_quota_exhausted" : "sub_quota_exhausted", job.kind === "text" ? until : undefined);
  else if (failure) job.fail(failure.error);
  else if (job.kind === "image" && "image" in answer) job.resolve({ ok: true, image: answer.image, ...(answer.usage ? { usage: answer.usage } : {}) });
  else if (job.kind === "text" && "text" in answer) {
    job.resolve({ ok: true, text: answer.text, ...(answer.usage ? { usage: answer.usage } : {}), ...(answer.answeredModel ? { answeredModel: answer.answeredModel } : {}) });
  } else job.fail(job.kind === "image" ? "codex_worker_failed" : "sub_exec_failed"); // answered the wrong kind
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
  b.queue = []; b.running.clear(); b.workers = { owner: noWorker(), schedule: noWorker() }; b.wake.clear(); b.deferred.clear();
}
