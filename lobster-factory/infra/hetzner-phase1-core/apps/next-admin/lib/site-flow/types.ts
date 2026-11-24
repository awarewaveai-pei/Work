// Site-flow step contract (SITE-FLOW-COMPLETION-PLAN.md §0 I1/I2, card SF-G). Every step that touches the host has
// the same shape as lib/repair-center/remediations/types.ts: precheck -> plan -> (operator confirms the plan hash)
// -> execute -> verify -> rollback on failure. SF-H / SF-I write the step bodies; lib/site-flow/engine.ts runs them.
//
// Traps for step authors:
// - observe() is the ONLY answer to "is this step done" (I1). Nothing stores a done flag; a run that completed says
//   only that the last attempt passed verify. Something half-built must come back "partial", never "done".
// - plan() must be deterministic for an unchanged site: the operator confirms its hash, and execute recomputes it
//   and refuses (409) on any difference. No timestamps, random ids or passwords in a plan.
// - Secrets (admin password, bridge private key) never go in a plan, a StepResult `detail` or `output`: all three are
//   stored in ops_action_runs. A value the operator must see once goes in `reveal` (HTTP response only, never stored).
// - observe() and plan() get a read-only gate (no run record, no system-mode check stands behind them); anything
//   that changes the host belongs in precheck/execute/verify/rollback.
// - timeoutMs is how long a run of this step may stay `running` before the engine closes it as failed and allows a
//   re-run (process killed by the 03:00 deploy or OOM, host job lost). The engine clamps it to
//   [SITE_STEP_TIMEOUT_MIN_MS, SITE_STEP_TIMEOUT_MAX_MS]; the max stays under lib/repair-center/hygiene.ts's 2 h
//   reaper, which closes any running ops_action_runs row without a rollback.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SiteGateClient } from "./gate-client";

export const SITE_STEP_TIMEOUT_MIN_MS = 10 * 60_000;
export const SITE_STEP_TIMEOUT_MAX_MS = 110 * 60_000;

/** The gate verbs that only read the host. */
export type SiteGateReader = Pick<SiteGateClient, "provider" | "preflight" | "job">;

/** Result of a step's input check (SiteStepDefinition.parseInput). */
export type InputCheck = { ok: true; input: Record<string, unknown> } | { ok: false; error: string };

export const SITE_STEP_KEYS = ["preflight", "create", "wp_install", "vhost", "mainwp", "bridge", "open"] as const;
export type SiteStepKey = (typeof SITE_STEP_KEYS)[number];

/** The ops_action_catalog key of a step (seeded by migration 0176, all enabled=false). */
export const actionKeyOf = (step: SiteStepKey): `site.${SiteStepKey}` => `site.${step}`;
export const isSiteStepKey = (v: unknown): v is SiteStepKey => (SITE_STEP_KEYS as readonly unknown[]).includes(v);

type Json = Record<string, unknown>;

export interface SiteRow {
  id: string;
  organization_id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  primary_domain: string | null;
  /** sites.locale (zh_TW, en, ...); absent on rows built by older callers. */
  locale?: string | null;
  metadata: Json;
}

export interface EnvironmentRow {
  id: string;
  site_id: string;
  organization_id: string;
  environment_type: string;
  hosting_provider: string | null;
  base_url: string | null;
  wp_root_path: string | null;
  status: string;
  metadata: Json;
}

/** One finished attempt of a step on this environment (I1: "the last run" half of an observation). */
export interface RunFacts {
  status: "completed" | "failed";
  started_at: string;
  input: Json;
  /** ops_action_runs.output_payload: {plan_hash, plan, stages[{stage, ok, detail, output?}]} */
  output: Json;
}

export interface ReadContext {
  db: SupabaseClient;
  site: SiteRow;
  environment: EnvironmentRow;
  /** Read verbs only. Within one engine call every preflight() answers from ONE host call (item 4, SF-H). */
  gate: SiteGateReader;
  /** The step input the operator sent with plan/execute, already checked by the step's parseInput ({} when none). */
  input: Json;
  /** Finished runs (completed/failed) of a step on this environment, newest first. */
  history(step: SiteStepKey): Promise<RunFacts[]>;
}

export interface StepContext extends ReadContext {
  gate: SiteGateClient;
  /** A pending run's place, as its last execute/verify answered it (StepResult.progress); undefined at first. */
  progress?: Json;
}

/** One stage's answer. `jobId` (execute only): the host started a background job; the run stays running until polled. */
export interface StepResult {
  ok: boolean;
  detail: string;
  /** Stored with the stage in ops_action_runs.output_payload. */
  output?: Json;
  /** Returned in this HTTP response only; never written anywhere (one-time admin password). */
  reveal?: Json;
  jobId?: string;
  /**
   * The host may still be working after this answer (a gate call outlived the SSH timeout; the gate ignores the hangup
   * and finishes under its slug lock). execute: the run stays `running` and every poll calls verify. verify: "not
   * finished yet, ask again" -- never done, never failed. The step's timeoutMs bounds how long this can last.
   */
  pending?: boolean;
  /** With `pending`: where the step is, handed back as StepContext.progress on the next poll (no secret in it). */
  progress?: Json;
}

/**
 * done: everything this step creates exists and checks out. partial: some of it exists (shown as failed, re-runnable).
 * absent: nothing yet. blocked: cannot run now for an outside reason (domain held by another vhost, no certificate).
 * unknown: could not observe (host unreachable) -- never treated as done.
 */
export type ObservationStatus = "done" | "partial" | "absent" | "blocked" | "unknown";

export interface StepObservation {
  status: ObservationStatus;
  detail: string;
  facts?: Json;
}

/** What the operator reads before confirming. Hashed as a whole (engine.planHash). */
export interface StepPlan {
  summary: string;
  /** Host paths, container names, ports, domain, certificate -- one line each. */
  items: Array<{ label: string; value: string }>;
  rollback: string;
  /** Values execute/verify/rollback act on; part of the hash, so they cannot change after confirmation. */
  params: Json;
}

export interface SiteStepDefinition {
  key: SiteStepKey;
  title: string;
  /** Steps whose observation must be `done` before this one can run. */
  requires: SiteStepKey[];
  /** Per environment instead of `requires` (engine requiresOf), e.g. a staging subdirectory site has no host steps 1-5. */
  requiresOn?(env: EnvironmentRow): SiteStepKey[];
  timeoutMs: number;
  /** Checks the operator's step input (plan and execute both send it; it is part of the plan, so of the hash). */
  parseInput?(raw: unknown): InputCheck;
  /**
   * Non-null = on this environment the step is not run here but confirmed by hand (sites.metadata.manual_checks
   * `key`, steps/manual-checks.ts); execute refuses. Example: vhost when ingress=product-gateway.
   */
  manual?(env: EnvironmentRow): { key: string; label: string } | null;
  observe(ctx: ReadContext): Promise<StepObservation>;
  precheck(ctx: StepContext): Promise<StepResult>;
  plan(ctx: ReadContext): Promise<StepPlan>;
  execute(ctx: StepContext, plan: StepPlan): Promise<StepResult>;
  verify(ctx: StepContext, plan: StepPlan): Promise<StepResult>;
  rollback(ctx: StepContext, plan: StepPlan): Promise<StepResult>;
}

export type SiteStepRegistry = Partial<Record<SiteStepKey, SiteStepDefinition>>;

/** §2 page states: 未開始／可以做／被擋住／執行中／完成／失敗, plus not_available (no step body yet). */
export type StepState = "not_started" | "ready" | "blocked" | "running" | "done" | "failed" | "not_available";

export interface StepRunSummary {
  id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  error_summary: string | null;
  /** Why a failed run failed, in the words of the stage that failed (output_payload.stages); null when none. */
  error_detail: string | null;
}

export interface StepStatus {
  key: SiteStepKey;
  actionKey: string;
  title: string;
  /** Catalog row exists and enabled (I6 per-step key). */
  enabled: boolean;
  state: StepState;
  reason: string | null;
  observation: StepObservation | null;
  lastRun: StepRunSummary | null;
  /** Set when this step is confirmed by hand on this environment (see SiteStepDefinition.manual). */
  manual: { key: string; label: string } | null;
}
