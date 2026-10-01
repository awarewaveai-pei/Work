// Remediation catalog contract (Auto-Repair A2, 2026-07-03).
//
// A remediation is a DETERMINISTIC, allowlisted, four-stage action:
//   precheck  → conditions verified against live state BEFORE touching anything
//   execute   → the one bounded action (e.g. docker compose restart <svc>)
//   healthcheck → post-action verification; failure triggers rollback
//   rollback  → best-effort undo (may be a documented no-op for idempotent
//               actions like restart)
//
// Red lines (AGENTS.md §6 Auto-Repair): a remediation must never touch secrets /
// auth / payment / DB migrations, and must never run without its precheck.
// LLMs never execute these — they only recommend; execution is this catalog
// or a human. This file is the B-orchestrator action-layer contract.

import type { Incident } from "@/lib/ops-inbox/types";

export interface RemediationStepResult {
  ok: boolean;
  detail: string;
}

export interface RemediationContext {
  incident: Incident;
}

export interface Remediation {
  /** ops_action_catalog key suffix → full key is `ops.remediation.<key>`. */
  key: string;
  title: string;
  /** Static match: is this remediation applicable to this incident at all? */
  matches(incident: Incident): boolean;
  precheck(ctx: RemediationContext): Promise<RemediationStepResult>;
  execute(ctx: RemediationContext): Promise<RemediationStepResult>;
  healthcheck(ctx: RemediationContext): Promise<RemediationStepResult>;
  rollback(ctx: RemediationContext): Promise<RemediationStepResult>;
}
