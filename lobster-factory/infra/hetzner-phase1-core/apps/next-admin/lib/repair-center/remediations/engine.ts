// Remediation engine (Auto-Repair A2, 2026-07-03).
//
// Runs a catalog remediation against an incident with the full safety
// envelope:
//   flag gate (auto mode only) → system-mode gate → cooldown → precheck →
//   execute → healthcheck → rollback on healthcheck failure → audit
//   (ops_action_runs + incident tag)
//
// Safety defaults (AGENTS.md §自動化安全預設):
//   - AUTO_REMEDIATE_ENABLED defaults to OFF — auto mode does nothing until
//     the operator explicitly turns it on. Manual mode (RBAC-gated route)
//     works regardless, because a human already approved that click.
//   - System-mode gate (checkRepairAllowed): both auto and manual mode run
//     only while the org's (or global's) system mode is normal. A human
//     clicking "Run Remediation" does not bypass this -- they must flip the
//     mode back to normal at /ops/system-modes first, same as any repair.
//   - Cooldown: one attempt per incident fingerprint per 30 min. A remediation
//     that "fixes" the same alert every few minutes is masking a real problem;
//     the second occurrence inside the window goes to a human.
//   - Every attempt (including refused ones in manual mode) leaves an
//     ops_action_runs row — no invisible prod mutations.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Incident } from "@/lib/ops-inbox/types";
import { beginOpsActionRun, finishOpsActionRun } from "@/lib/ops-actions/record";
import { checkRepairAllowed } from "../system-mode-gate";
import type { Remediation, RemediationStepResult } from "./types";
import { REMEDIATIONS } from "./index";

export const REMEDIATION_COOLDOWN_MS = 30 * 60_000;
const PLATFORM_ORG_SLUG = "awarewave-ops";

export interface RemediationOutcome {
  attempted: boolean;
  ok?: boolean;
  key?: string;
  reason?: string;
  action_run_id?: string | null;
  steps?: Array<{ step: string; ok: boolean; detail: string }>;
}

export function autoRemediateEnabled(): boolean {
  return (process.env.AUTO_REMEDIATE_ENABLED ?? "").trim().toLowerCase() === "true";
}

export function findRemediation(incident: Incident): Remediation | null {
  return REMEDIATIONS.find((r) => r.matches(incident)) ?? null;
}

async function resolveOrgId(supabase: SupabaseClient, incident: Incident): Promise<string | null> {
  if (incident.organization_id) return incident.organization_id;
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", PLATFORM_ORG_SLUG)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function inCooldown(supabase: SupabaseClient, incident: Incident, key: string): Promise<boolean> {
  // Keyed on the target SERVICE, not the incident fingerprint: a flapping
  // monitor that varies its title (cert-expiry countdowns, changing messages)
  // would mint new fingerprints and dodge a fingerprint-keyed cooldown. The
  // service is what we actually restart, so it is the correct throttle unit.
  const service = incident.service?.trim();
  if (!service) return false; // no service → nothing to throttle (matcher won't fire anyway)
  const since = new Date(Date.now() - REMEDIATION_COOLDOWN_MS).toISOString();
  const { data, error } = await supabase
    .from("ops_action_runs")
    .select("id")
    .contains("metadata", { action_key: `ops.remediation.${key}`, remediation_service: service })
    .gte("started_at", since)
    .limit(1);
  if (error) return false; // fail-open toward attempting — precheck still guards reality
  return (data ?? []).length > 0;
}

/**
 * Attempt remediation for an incident. `mode: "auto"` is the webhook ingest
 * path (flag-gated); `mode: "manual"` is the RBAC route (human already chose).
 * Never throws.
 */
export async function tryRemediate(
  supabase: SupabaseClient,
  incident: Incident,
  opts: { mode: "auto" | "manual"; actor: string },
): Promise<RemediationOutcome> {
  try {
    if (opts.mode === "auto" && !autoRemediateEnabled()) {
      return { attempted: false, reason: "auto_remediate_disabled" };
    }

    const remediation = findRemediation(incident);
    if (!remediation) return { attempted: false, reason: "no_matching_remediation" };

    const gate = await checkRepairAllowed(supabase, incident.organization_id ?? null);
    if (!gate.allowed) {
      return { attempted: false, key: remediation.key, reason: "system_mode_blocks_remediation" };
    }

    if (await inCooldown(supabase, incident, remediation.key)) {
      return { attempted: false, key: remediation.key, reason: "cooldown_active" };
    }

    const organizationId = await resolveOrgId(supabase, incident);
    if (!organizationId) return { attempted: false, key: remediation.key, reason: "no_organization" };

    const runId = await beginOpsActionRun({
      actionKey: `ops.remediation.${remediation.key}`,
      displayName: remediation.title,
      riskLevel: "medium",
      organizationId,
      actorRole: "operator",
      inputPayload: {
        incident_id: incident.id,
        incident_title: incident.title,
        service: incident.service,
        mode: opts.mode,
        actor: opts.actor,
      },
      metadata: {
        incident_fingerprint: incident.fingerprint,
        remediation_service: incident.service?.trim() ?? null,
        client_slug: incident.client_slug ?? null,
        source: opts.mode === "auto" ? "auto_remediate" : "manual_remediate",
      },
    });

    const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
    const record = (step: string, r: RemediationStepResult) => {
      steps.push({ step, ok: r.ok, detail: r.detail });
      return r.ok;
    };
    const ctx = { incident };

    let ok = false;
    let failureReason: string | undefined;

    if (!record("precheck", await remediation.precheck(ctx))) {
      failureReason = "precheck_failed";
    } else if (!record("execute", await remediation.execute(ctx))) {
      failureReason = "execute_failed";
    } else if (!record("healthcheck", await remediation.healthcheck(ctx))) {
      failureReason = "healthcheck_failed";
      record("rollback", await remediation.rollback(ctx));
    } else {
      ok = true;
    }

    await finishOpsActionRun(runId, ok, { steps, mode: opts.mode }, failureReason);

    // Leave a trace on the incident itself so the inbox page shows what the
    // machine tried without a join. Best-effort.
    try {
      await supabase
        .from("ops_incidents")
        .update({
          tags: {
            ...(incident.tags ?? {}),
            last_remediation: {
              key: remediation.key,
              ok,
              reason: failureReason ?? "recovered",
              action_run_id: runId,
              at: new Date().toISOString(),
            },
          },
        })
        .eq("id", incident.id);
    } catch {
      /* fail-open */
    }

    return { attempted: true, ok, key: remediation.key, reason: failureReason, action_run_id: runId, steps };
  } catch (e) {
    console.warn("[remediation] tryRemediate failed (fail-open):", e);
    return { attempted: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
