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

export const SITE_STEP_KEYS = ["preflight", "create", "wp_install", "vhost", "mainwp", "bridge", "open"] as const;
export type SiteStepKey = (typeof SITE_STEP_KEYS)[number];

/** The ops_action_catalog key of a step (seeded by migration 0175, all enabled=false). */
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

export interface ReadContext {
  db: SupabaseClient;
  site: SiteRow;
  environment: EnvironmentRow;
  gate: SiteGateReader;
}

export interface StepContext extends ReadContext {
  gate: SiteGateClient;
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
  timeoutMs: number;
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
}
