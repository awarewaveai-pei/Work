// Site-flow step engine (SITE-FLOW-COMPLETION-PLAN.md §0 I1/I2/I6, §1-3, card SF-G).
//
// execute: step known -> catalog row exists (else refuse, NO auto-seed, no run: lib/ops-actions/record.ts:38-58 is
// deliberately not used) -> catalog enabled (else blocked run) -> system mode (else blocked run, 423) -> close
// timed-out site.* runs of this environment -> write the run (write fails = stop before any gate call) -> no other
// site.* run live on this environment -> required steps observed done -> recompute plan, hash must equal the
// confirmed one (else 409) -> precheck -> execute -> verify -> rollback on any failure after execute started.
// A host background job keeps the run `running`; pollRun finishes it.
//
// Traps:
// - Step state is never stored: getSiteFlowStatus derives it from each step's observe() plus the step's last run.
// - Every write that ends a run is a CAS on status=running, and it comes BEFORE the rollback: whoever wins the CAS
//   owns the rollback, a loser (the run was reclaimed or another poll finished it) touches nothing more. A lost
//   CAS after a success answers 409 run_reclaimed; the step's observation still shows what the host has.
// - One live site.* run per environment: steps on one site share files and containers, so they never overlap.
// - Runs are never written with status `pending`: the Trigger dispatcher picks up pending rows (migration 0037).
// - The operator id goes into run metadata, not actor_user_id: that column references profiles(id), and an FK miss
//   would fail the run write and therefore the step.
// - observe()/plan() receive a reader that exposes only read verbs, so a step cannot change the host from a path
//   that has no run record and no system-mode check.

import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkProductionChangeAllowed } from "@/lib/system-modes/production-change-gate";
import { blockedChangeBody } from "@/lib/system-modes/blocked-change";
import type { SiteGateClient } from "./gate-client";
import {
  actionKeyOf,
  SITE_STEP_KEYS,
  SITE_STEP_TIMEOUT_MAX_MS,
  SITE_STEP_TIMEOUT_MIN_MS,
  type EnvironmentRow,
  type ReadContext,
  type SiteGateReader,
  type SiteRow,
  type SiteStepDefinition,
  type SiteStepKey,
  type SiteStepRegistry,
  type StepContext,
  type StepObservation,
  type StepPlan,
  type StepResult,
  type StepRunSummary,
  type StepState,
  type StepStatus,
} from "./types";

/** Step bodies (SF-H: preflight/create/wp_install/vhost/open; SF-I: mainwp/bridge) register here. */
export const SITE_STEP_DEFINITIONS: SiteStepRegistry = {};

type Json = Record<string, unknown>;
type Db = SupabaseClient;
type OpsRole = "owner" | "admin" | "operator" | "viewer";

export interface EngineDeps {
  db: Db;
  steps: SiteStepRegistry;
  gateFor(environment: EnvironmentRow): SiteGateClient;
  now?: () => number;
}

export interface Actor {
  role: OpsRole;
  userId: string | null;
}

export interface EngineOutcome {
  status: number;
  body: Json;
}

interface Stage {
  stage: "precheck" | "execute" | "verify" | "rollback" | "job";
  ok: boolean;
  detail: string;
  output?: Json;
}

const RUN_COLS = "id,action_id,environment_id,status,started_at,ended_at,error_summary,input_payload,output_payload,metadata";
const HASH_RE = /^[0-9a-f]{64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALL_STEPS = [...SITE_STEP_KEYS];

const ENVIRONMENT_TYPES = ["production", "staging", "preview", "local"] as const;

/** The `environment` query/body value of the site-flow routes; absent = production, null = invalid. */
export function environmentTypeParam(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return "production";
  return typeof raw === "string" && (ENVIRONMENT_TYPES as readonly string[]).includes(raw) ? raw : null;
}

const out = (status: number, body: Json): EngineOutcome => ({ status, body });
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const isPlain = (v: unknown): v is Json => isObj(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));

/** A step's timeout as the engine applies it (see types.ts SITE_STEP_TIMEOUT_*). */
export const timeoutOf = (def: SiteStepDefinition): number =>
  Math.min(SITE_STEP_TIMEOUT_MAX_MS, Math.max(SITE_STEP_TIMEOUT_MIN_MS, Number(def.timeoutMs) || 0));

/** Key-sorted JSON, so the same plan always hashes the same. Anything that is not plain JSON is refused. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (isObj(v)) {
    if (!isPlain(v)) throw new Error("plan holds a non-JSON object (Date, Map, class instance)");
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  }
  if (v === undefined || typeof v === "function" || typeof v === "symbol" || typeof v === "bigint") {
    throw new Error(`plan holds a non-JSON value (${typeof v})`);
  }
  return JSON.stringify(v);
}

export function planHash(step: SiteStepKey, environmentId: string, plan: StepPlan): string {
  return createHash("sha256").update(stable({ step, environmentId, plan })).digest("hex");
}

async function safe(fn: () => Promise<StepResult>): Promise<StepResult> {
  try {
    const r = await fn();
    return r && typeof r.ok === "boolean" ? r : { ok: false, detail: "step returned no result" };
  } catch (e) {
    return { ok: false, detail: `threw: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500) };
  }
}

async function observeSafe(def: SiteStepDefinition, ctx: ReadContext): Promise<StepObservation> {
  try {
    const o = await def.observe(ctx);
    return o && typeof o.status === "string" ? o : { status: "unknown", detail: "observe returned nothing" };
  } catch (e) {
    return { status: "unknown", detail: `observe threw: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500) };
  }
}

/** Only the read verbs, as a new object: a step cannot reach create/vhost/wp through it. */
function readerOf(gate: SiteGateClient): SiteGateReader {
  return { provider: gate.provider, preflight: () => gate.preflight(), job: (id: string) => gate.job(id) };
}

function readContext(db: Db, site: SiteRow, environment: EnvironmentRow, gate: SiteGateClient): ReadContext {
  return { db, site, environment, gate: readerOf(gate) };
}

// ── loading ──────────────────────────────────────────────────────────────────

export async function loadSiteEnvironment(
  db: Db,
  siteId: string,
  environmentType: string,
): Promise<{ ok: true; site: SiteRow; environment: EnvironmentRow } | { ok: false; outcome: EngineOutcome }> {
  if (!UUID_RE.test(siteId)) return { ok: false, outcome: out(400, { ok: false, error: "invalid_site_id" }) };
  const { data: site, error: siteErr } = await db
    .from("sites")
    .select("id,organization_id,workspace_id,project_id,name,primary_domain,metadata")
    .eq("id", siteId)
    .maybeSingle();
  if (siteErr) return { ok: false, outcome: out(503, { ok: false, error: "site_lookup_failed" }) };
  if (!site) return { ok: false, outcome: out(404, { ok: false, error: "site_not_found" }) };
  const { data: env, error: envErr } = await db
    .from("environments")
    .select("id,site_id,organization_id,environment_type,hosting_provider,base_url,wp_root_path,status,metadata")
    .eq("site_id", siteId)
    .eq("environment_type", environmentType)
    .neq("status", "archived")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (envErr) return { ok: false, outcome: out(503, { ok: false, error: "environment_lookup_failed" }) };
  if (!env) return { ok: false, outcome: out(404, { ok: false, error: "environment_not_found" }) };
  const s = site as SiteRow;
  const e = env as EnvironmentRow;
  return {
    ok: true,
    site: { ...s, metadata: isObj(s.metadata) ? s.metadata : {} },
    environment: { ...e, metadata: isObj(e.metadata) ? e.metadata : {} },
  };
}

type CatalogRows = Map<string, { id: string; enabled: boolean }>;

async function readCatalog(db: Db): Promise<CatalogRows | null> {
  const { data, error } = await db
    .from("ops_action_catalog")
    .select("id,action_key,enabled")
    .in(
      "action_key",
      ALL_STEPS.map((k) => actionKeyOf(k)),
    );
  if (error) return null;
  const rows: CatalogRows = new Map();
  for (const r of (data ?? []) as Array<{ id: string; action_key: string; enabled: boolean }>) {
    rows.set(r.action_key, { id: String(r.id), enabled: r.enabled === true });
  }
  return rows;
}

const siteActionIds = (cat: CatalogRows): string[] => [...cat.values()].map((r) => r.id);

// ── run records ──────────────────────────────────────────────────────────────

interface NewRun {
  actionId: string;
  step: SiteStepKey;
  site: SiteRow;
  environment: EnvironmentRow;
  actor: Actor;
  status: "running" | "blocked";
  inputPayload: Json;
  errorSummary?: string;
}

function runMetadata(r: NewRun, extra: Json = {}): Json {
  return { action_key: actionKeyOf(r.step), step: r.step, source: "site_flow", actor_user_id: r.actor.userId, ...extra };
}

/** Inserts one run. Returns its id, or null when the write failed (the caller then does nothing on the host). */
async function insertRun(db: Db, r: NewRun): Promise<string | null> {
  const id = randomUUID();
  try {
    const { error } = await db.from("ops_action_runs").insert({
      id,
      action_id: r.actionId,
      organization_id: r.site.organization_id,
      workspace_id: r.site.workspace_id,
      project_id: r.site.project_id,
      site_id: r.site.id,
      environment_id: r.environment.id,
      actor_role: r.actor.role,
      status: r.status,
      approval_required: true,
      approval_status: "approved",
      trace_id: `${actionKeyOf(r.step)}-${id}`,
      input_payload: r.inputPayload,
      metadata: runMetadata(r),
      ...(r.status === "blocked" ? { error_summary: r.errorSummary ?? "blocked", ended_at: new Date().toISOString() } : {}),
    });
    return error ? null : id;
  } catch {
    return null;
  }
}

/** CAS on status=running. True only for the caller whose update moved the row. */
async function casRunning(db: Db, runId: string, patch: Json): Promise<boolean> {
  try {
    const { data, error } = await db.from("ops_action_runs").update(patch).eq("id", runId).eq("status", "running").select("id");
    return !error && Array.isArray(data) && data.length === 1;
  } catch {
    return false;
  }
}

const finishRun = (db: Db, runId: string, status: "completed" | "failed" | "cancelled", output: Json, errorSummary: string | null) =>
  casRunning(db, runId, { status, output_payload: output, error_summary: errorSummary, ended_at: new Date().toISOString() });

/** Plain update of a run this caller already owns by a won CAS; never changes status. */
async function writeOutput(db: Db, runId: string, output: Json): Promise<void> {
  try {
    await db.from("ops_action_runs").update({ output_payload: output }).eq("id", runId);
  } catch {
    /* the status write already happened; the run stays truthful without the extra detail */
  }
}

/**
 * Closes this environment's runs of these actions that are still `running` past their step's timeout (the process
 * that owned them died). CAS per row on the status it read, so a run finishing at the same moment is never
 * overwritten, and two callers closing the same row produce one close. No rollback: the owner is gone, and a
 * re-run or the step's observation decides what is left.
 */
export async function reclaimStaleRuns(
  db: Db,
  args: { actionId: string; environmentId: string; timeoutMs: number; now: number },
): Promise<string[]> {
  const cutoff = new Date(args.now - args.timeoutMs).toISOString();
  const { data, error } = await db
    .from("ops_action_runs")
    .select("id,output_payload")
    .eq("action_id", args.actionId)
    .eq("environment_id", args.environmentId)
    .eq("status", "running")
    .lt("started_at", cutoff);
  if (error) return [];
  const closed: string[] = [];
  for (const row of (data ?? []) as Array<{ id: string; output_payload?: unknown }>) {
    const prev = isObj(row.output_payload) ? row.output_payload : {};
    const won = await finishRun(
      db,
      row.id,
      "failed",
      { ...prev, reclaimed: true },
      `timed out: still running after ${Math.round(args.timeoutMs / 1000)} s (process stopped or host job lost); re-run the step`,
    );
    if (won) closed.push(row.id);
  }
  return closed;
}

async function reclaimEnvironment(deps: EngineDeps, cat: CatalogRows, environmentId: string): Promise<void> {
  const now = (deps.now ?? Date.now)();
  for (const k of ALL_STEPS) {
    const def = deps.steps[k];
    const row = cat.get(actionKeyOf(k));
    if (def && row) await reclaimStaleRuns(deps.db, { actionId: row.id, environmentId, timeoutMs: timeoutOf(def), now });
  }
}

// ── plan ─────────────────────────────────────────────────────────────────────

export async function planStep(
  deps: EngineDeps,
  args: { site: SiteRow; environment: EnvironmentRow; step: SiteStepKey },
): Promise<EngineOutcome> {
  const def = deps.steps[args.step];
  if (!def) return out(404, { ok: false, error: "step_not_available" });
  const cat = await readCatalog(deps.db);
  if (!cat) return out(503, { ok: false, error: "catalog_unreadable" });
  const row = cat.get(actionKeyOf(args.step));
  if (!row) return out(403, { ok: false, error: "step_not_registered", detail: `no ops_action_catalog row for ${actionKeyOf(args.step)}` });
  if (!row.enabled) return out(403, { ok: false, error: "step_disabled", detail: "此步驟尚未開放" });
  try {
    const plan = await def.plan(readContext(deps.db, args.site, args.environment, deps.gateFor(args.environment)));
    return out(200, { ok: true, step: args.step, plan, planHash: planHash(args.step, args.environment.id, plan) });
  } catch (e) {
    return out(502, { ok: false, error: "plan_failed", detail: e instanceof Error ? e.message : String(e) });
  }
}

// ── execute ──────────────────────────────────────────────────────────────────

async function rollbackIfAllowed(deps: EngineDeps, def: SiteStepDefinition, ctx: StepContext, plan: StepPlan): Promise<Stage> {
  const gate = await checkProductionChangeAllowed(deps.db, ctx.site.organization_id);
  if (!gate.allowed) {
    return { stage: "rollback", ok: false, detail: `system mode ${gate.mode} blocked the rollback; a human must undo this step` };
  }
  const r = await safe(() => def.rollback(ctx, plan));
  return { stage: "rollback", ok: r.ok, detail: r.detail };
}

const stageOf = (stage: Stage["stage"], r: StepResult): Stage => ({ stage, ok: r.ok, detail: r.detail, ...(r.output ? { output: r.output } : {}) });

export async function executeStep(
  deps: EngineDeps,
  args: { site: SiteRow; environment: EnvironmentRow; step: SiteStepKey; planHash: unknown; actor: Actor },
): Promise<EngineOutcome> {
  const { db } = deps;
  const def = deps.steps[args.step];
  if (!def) return out(404, { ok: false, error: "step_not_available" });
  if (typeof args.planHash !== "string" || !HASH_RE.test(args.planHash)) {
    return out(400, { ok: false, error: "plan_hash_required" });
  }
  const confirmed = args.planHash;

  // I6: the catalog row is the per-step key. No row = refuse; never seed one.
  const cat = await readCatalog(db);
  if (!cat) return out(503, { ok: false, error: "catalog_unreadable" });
  const row = cat.get(actionKeyOf(args.step));
  if (!row) return out(403, { ok: false, error: "step_not_registered", detail: `no ops_action_catalog row for ${actionKeyOf(args.step)}` });

  const base = { actionId: row.id, step: args.step, site: args.site, environment: args.environment, actor: args.actor };
  const input = { plan_hash: confirmed };

  if (!row.enabled) {
    const runId = await insertRun(db, { ...base, status: "blocked", inputPayload: input, errorSummary: "step_disabled" });
    return out(403, { ok: false, error: "step_disabled", detail: "此步驟尚未開放", runId });
  }

  const mode = await checkProductionChangeAllowed(db, args.site.organization_id);
  if (!mode.allowed) {
    const runId = await insertRun(db, { ...base, status: "blocked", inputPayload: input, errorSummary: `system_mode_blocks_change: ${mode.mode}` });
    return out(423, { ...blockedChangeBody(mode.mode), runId });
  }

  await reclaimEnvironment(deps, cat, args.environment.id);

  // I6: no record, no action. Nothing below this line runs without a run row.
  const runId = await insertRun(db, { ...base, status: "running", inputPayload: input });
  if (!runId) return out(503, { ok: false, error: "run_record_failed", detail: "ops_action_runs write failed; nothing was done" });

  const cancel = async (status: number, error: string, extra: Json = {}) => {
    await finishRun(db, runId, "cancelled", {}, error);
    return out(status, { ok: false, error, runId, ...extra });
  };

  // One live site.* run per environment. Both of two concurrent requests insert before they read, so at least one
  // sees the other: never both proceed (worst case both cancel and the operator presses again).
  const { data: others, error: othersErr } = await db
    .from("ops_action_runs")
    .select("id")
    .eq("environment_id", args.environment.id)
    .in("action_id", siteActionIds(cat))
    .eq("status", "running")
    .neq("id", runId)
    .limit(1);
  if (othersErr) return cancel(503, "concurrency_check_failed");
  if ((others ?? []).length > 0) return cancel(409, "another_step_running", { detail: "這個環境有另一個步驟正在執行" });

  const gate = deps.gateFor(args.environment);
  const readCtx = readContext(db, args.site, args.environment, gate);
  const missing: SiteStepKey[] = [];
  for (const dep of def.requires) {
    const depDef = deps.steps[dep];
    if (!depDef || (await observeSafe(depDef, readCtx)).status !== "done") missing.push(dep);
  }
  if (missing.length > 0) return cancel(409, "prerequisite_not_done", { missing });

  let plan: StepPlan;
  let current: string;
  try {
    plan = await def.plan(readCtx);
    current = planHash(args.step, args.environment.id, plan);
  } catch (e) {
    await finishRun(db, runId, "failed", {}, `plan_failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500));
    return out(502, { ok: false, error: "plan_failed", runId });
  }
  if (current !== confirmed) {
    return cancel(409, "plan_changed", { detail: "計畫已變更，請重新檢視後再確認", plan, planHash: current });
  }

  const ctx: StepContext = { db, site: args.site, environment: args.environment, gate };
  const stages: Stage[] = [];
  const output = () => ({ plan_hash: current, plan, stages });
  let reveal: Json | undefined;
  const respond = (status: number, body: Json) => out(status, { ...body, runId, stages, ...(reveal ? { reveal } : {}) });
  const reclaimed = () => respond(409, { ok: false, error: "run_reclaimed", detail: "這次執行已被逾時收回；請看步驟現況再決定是否重跑" });

  /** Claim the failure first; only the winner rolls back. */
  const failWithRollback = async (reason: string) => {
    if (!(await finishRun(db, runId, "failed", output(), reason))) return reclaimed();
    stages.push(await rollbackIfAllowed(deps, def, ctx, plan));
    await writeOutput(db, runId, output());
    return respond(200, { ok: false, outcome: "failed", reason });
  };

  const pre = await safe(() => def.precheck(ctx));
  stages.push(stageOf("precheck", pre));
  if (!pre.ok) {
    if (!(await finishRun(db, runId, "failed", output(), "precheck_failed"))) return reclaimed();
    return respond(200, { ok: false, outcome: "failed", reason: "precheck_failed" });
  }

  const exec = await safe(() => def.execute(ctx, plan));
  stages.push(stageOf("execute", exec));
  reveal = exec.reveal;
  if (!exec.ok) return failWithRollback("execute_failed");

  if (exec.jobId) {
    // Background host job: the run stays running; pollRun verifies and finishes it.
    const meta = runMetadata({ ...base, status: "running", inputPayload: input }, { host_job_id: exec.jobId });
    if (await casRunning(db, runId, { metadata: meta, output_payload: output() })) {
      return respond(202, { ok: true, outcome: "running", jobId: exec.jobId });
    }
    // Reclaimed meanwhile, or the write failed: without a recorded job id no poll can finish this run.
    if (!(await finishRun(db, runId, "failed", { ...output(), host_job_id: exec.jobId }, "job_id_not_recorded"))) return reclaimed();
    return respond(200, { ok: false, outcome: "failed", reason: "job_id_not_recorded" });
  }

  const ver = await safe(() => def.verify(ctx, plan));
  stages.push(stageOf("verify", ver));
  if (!ver.ok) return failWithRollback("verify_failed");
  if (!(await finishRun(db, runId, "completed", output(), null))) return reclaimed();
  return respond(200, { ok: true, outcome: "completed", reason: null });
}

// ── poll a run (background host jobs) ────────────────────────────────────────

interface RunRow {
  id: string;
  action_id: string;
  environment_id: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  error_summary: string | null;
  input_payload: unknown;
  output_payload: unknown;
  metadata: unknown;
}

const summary = (r: RunRow): StepRunSummary => ({
  id: r.id,
  status: r.status,
  started_at: r.started_at,
  ended_at: r.ended_at,
  error_summary: r.error_summary,
});

export async function pollRun(
  deps: EngineDeps,
  args: { site: SiteRow; environment: EnvironmentRow; step: SiteStepKey; runId: string },
): Promise<EngineOutcome> {
  const { db } = deps;
  const now = deps.now ?? Date.now;
  if (!UUID_RE.test(args.runId)) return out(400, { ok: false, error: "invalid_run_id" });
  const { data, error } = await db.from("ops_action_runs").select(RUN_COLS).eq("id", args.runId).maybeSingle();
  if (error) return out(503, { ok: false, error: "run_lookup_failed" });
  const run = data as RunRow | null;
  const meta: Json = run && isObj(run.metadata) ? run.metadata : {};
  if (!run || run.environment_id !== args.environment.id || meta.step !== args.step) return out(404, { ok: false, error: "run_not_found" });
  const def = deps.steps[args.step];
  if (run.status !== "running" || !def) return out(200, { ok: true, run: summary(run) });

  const reread = async () => {
    const { data: again } = await db.from("ops_action_runs").select(RUN_COLS).eq("id", run.id).maybeSingle();
    return out(200, { ok: true, run: summary((again as RunRow | null) ?? run) });
  };

  if (Date.parse(run.started_at) < now() - timeoutOf(def)) {
    await reclaimStaleRuns(db, { actionId: run.action_id, environmentId: args.environment.id, timeoutMs: timeoutOf(def), now: now() });
    return reread();
  }
  const jobId = typeof meta.host_job_id === "string" ? meta.host_job_id : null;
  if (!jobId) return out(200, { ok: true, run: summary(run) });

  const gate = deps.gateFor(args.environment);
  const ctx: StepContext = { db, site: args.site, environment: args.environment, gate };
  const job = await gate.job(jobId);
  // Only a transport error is "no answer yet" (the timeout closes the run if the host never answers). A refusal
  // (switch turned off, bad id, wrong provider) is an answer: the job cannot be followed, so the run fails.
  if ("error" in job && job.error === "transport") return out(200, { ok: true, run: summary(run), poll: { error: job.error, detail: job.detail } });
  if (!("error" in job) && job.data.state === "running") return out(200, { ok: true, run: summary(run) });

  const input = isObj(run.input_payload) ? run.input_payload : {};
  const prev = isObj(run.output_payload) ? run.output_payload : {};
  const plan = (isObj(prev.plan) ? prev.plan : input.plan) as StepPlan | undefined;
  const jobStage: Stage =
    "error" in job ? { stage: "job", ok: false, detail: `${job.error}: ${job.detail}` } : { stage: "job", ok: job.data.state === "succeeded", detail: job.data.detail };
  const stages: Stage[] = [...(Array.isArray(prev.stages) ? (prev.stages as Stage[]) : []), jobStage];

  if (!plan) {
    await finishRun(db, run.id, "failed", { ...prev, stages }, "plan_missing_on_run");
    return reread();
  }
  if (jobStage.ok) {
    const v = await safe(() => def.verify(ctx, plan));
    stages.push(stageOf("verify", v));
    if (v.ok) {
      await finishRun(db, run.id, "completed", { ...prev, stages }, null);
      return reread();
    }
  }
  // Claim the failure first (CAS); only the winner rolls back, so two polls never roll back twice.
  const reason = jobStage.ok ? "verify_failed" : "job_failed";
  if (await finishRun(db, run.id, "failed", { ...prev, stages }, reason)) {
    stages.push(await rollbackIfAllowed(deps, def, ctx, plan));
    await writeOutput(db, run.id, { ...prev, stages });
  }
  return reread();
}

// ── status (I1: derived, never stored) ───────────────────────────────────────

export function deriveStepState(args: {
  implemented: boolean;
  enabled: boolean;
  observation: StepObservation | null;
  lastRun: StepRunSummary | null;
  missing: SiteStepKey[];
}): { state: StepState; reason: string | null } {
  const { observation: obs, lastRun } = args;
  if (!args.implemented || !obs) return { state: "not_available", reason: "此步驟尚未提供" };
  if (lastRun?.status === "running") return { state: "running", reason: null };
  if (obs.status === "done") return { state: "done", reason: null };
  if (obs.status === "partial") return { state: "failed", reason: `部分完成：${obs.detail}` };
  if (lastRun?.status === "failed") return { state: "failed", reason: lastRun.error_summary ?? "上次執行失敗" };
  if (obs.status === "blocked") return { state: "blocked", reason: obs.detail };
  if (obs.status === "unknown") return { state: "blocked", reason: `無法確認現況：${obs.detail}` };
  if (args.missing.length > 0) return { state: "blocked", reason: `需先完成：${args.missing.join("、")}` };
  if (!args.enabled) return { state: "not_started", reason: "此步驟尚未開放" };
  return { state: "ready", reason: null };
}

export async function getSiteFlowStatus(
  deps: EngineDeps,
  args: { site: SiteRow; environment: EnvironmentRow },
): Promise<EngineOutcome> {
  const { db } = deps;
  const cat = await readCatalog(db);
  if (!cat) return out(503, { ok: false, error: "catalog_unreadable" });
  await reclaimEnvironment(deps, cat, args.environment.id);

  const actionIds = siteActionIds(cat);
  const lastByAction = new Map<string, StepRunSummary>();
  if (actionIds.length > 0) {
    // Attempts only (refusals are blocked/cancelled and never make a step look failed or running), filtered in the
    // query so a flood of refusals cannot push a live run out of the window.
    const { data, error } = await db
      .from("ops_action_runs")
      .select("id,action_id,status,started_at,ended_at,error_summary")
      .eq("environment_id", args.environment.id)
      .in("action_id", actionIds)
      .in("status", ["running", "failed", "completed"])
      .order("started_at", { ascending: false })
      .limit(200);
    if (error) return out(503, { ok: false, error: "runs_unreadable" });
    for (const r of (data ?? []) as RunRow[]) {
      if (!lastByAction.has(r.action_id)) lastByAction.set(r.action_id, summary(r));
    }
  }

  const ctx = readContext(db, args.site, args.environment, deps.gateFor(args.environment));
  const observations = new Map<SiteStepKey, StepObservation | null>();
  await Promise.all(
    ALL_STEPS.map(async (k) => {
      const def = deps.steps[k];
      observations.set(k, def ? await observeSafe(def, ctx) : null);
    }),
  );

  const steps: StepStatus[] = ALL_STEPS.map((k) => {
    const def = deps.steps[k];
    const row = cat.get(actionKeyOf(k));
    const lastRun = row ? lastByAction.get(row.id) ?? null : null;
    const observation = observations.get(k) ?? null;
    const missing = (def?.requires ?? []).filter((d) => observations.get(d)?.status !== "done");
    const { state, reason } = deriveStepState({ implemented: !!def, enabled: !!row?.enabled, observation, lastRun, missing });
    return { key: k, actionKey: actionKeyOf(k), title: def?.title ?? k, enabled: !!row?.enabled, state, reason, observation, lastRun };
  });

  return out(200, {
    ok: true,
    site: { id: args.site.id, name: args.site.name, organization_id: args.site.organization_id },
    environment: {
      id: args.environment.id,
      environment_type: args.environment.environment_type,
      hosting_provider: args.environment.hosting_provider,
      base_url: args.environment.base_url,
    },
    steps,
  });
}
