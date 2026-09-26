import { getSupabaseServerClient, getSupabaseWriteClient } from "@/lib/supabase-server";
import type { Incident } from "@/lib/ops-inbox/types";
import { appendAudit } from "./audit";
import { runPreRepairBackup } from "./backup";
import { findRemediation, tryRemediate } from "./remediations/engine";
import { createRepairIssue, postEscalationComment, resolveGithubTarget } from "./github";
import {
  canApprovePolicy,
  needsGitHubIssue,
  policyCatalogForSource,
  policyForIncident,
  severityRequiresHumanReview,
} from "./policy";
import { escalateGuard, isStrictTerminalState, TERMINAL_STATES } from "./run-state";
import { checkProductionChangeAllowed } from "@/lib/system-modes/production-change-gate";
import { REPAIR_RUN_STATES, REPAIR_DEPLOY_STATUSES } from "./types";
import type { RepairRun, RepairRunWithIncident } from "./types";

export async function fetchRepairRunWithIncident(id: string): Promise<RepairRunWithIncident | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const { data } = await supabase.from("repair_runs").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const run = data as RepairRun;
  const { data: incident } = await supabase.from("ops_incidents").select("*").eq("id", run.incident_id).maybeSingle();
  return { ...run, incident: incident as any };
}

export async function startRepairFromIncident(args: {
  incidentId: string;
  actor: string;
  source: "web" | "slack" | "telegram";
  /**
   * C5 critical-severity gate bypass. Set true ONLY when called from
   * confirmCriticalRun() after explicit operator second confirmation. Slack callbacks
   * and the default web "Approve" button MUST NOT pass this.
   */
  forceCriticalApproval?: boolean;
}): Promise<{ ok: boolean; run?: RepairRunWithIncident; error?: string; details?: unknown; blockedMode?: string }> {
  const supabase = getSupabaseWriteClient();
  if (!supabase) return { ok: false, error: "supabase_write_not_configured" };

  const { data: incident, error: incidentError } = await supabase
    .from("ops_incidents")
    .select("*")
    .eq("id", args.incidentId)
    .maybeSingle();
  if (incidentError) return { ok: false, error: "incident_fetch_failed", details: incidentError.message };
  if (!incident) return { ok: false, error: "incident_not_found" };

  const i = incident as Incident & { client_slug?: string | null };

  const gate = await checkProductionChangeAllowed(supabase, i.organization_id ?? null);
  if (!gate.allowed) {
    return { ok: false, error: "system_mode_blocks_repair", details: { mode: gate.mode }, blockedMode: gate.mode };
  }

  const policy = policyForIncident(i.source, i.severity);
  const target = resolveGithubTarget({
    id: "pending",
    incident_id: i.id,
    source: i.source,
    client_slug: i.client_slug ?? null,
    policy,
    state: "detected",
    approved_by: null,
    approved_at: null,
    backup_status: "not_started",
    backup_ref: null,
    backup_checked_at: null,
    backup_error: null,
    github_owner: null,
    github_repo: null,
    github_issue_number: null,
    github_issue_url: null,
    github_pr_number: null,
    github_pr_url: null,
    deploy_status: "not_started",
    deploy_ref: null,
    deploy_checked_at: null,
    risk_level: i.severity === "critical" ? "critical" : i.severity === "high" ? "high" : "medium",
    needs_human_review: false,
    audit_log: [],
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    incident: i as any,
  });

  const existing = await supabase.from("repair_runs").select("*").eq("incident_id", i.id).maybeSingle();
  if (existing.error) return { ok: false, error: "repair_run_fetch_failed", details: existing.error.message };

  let run: RepairRun;
  if (existing.data) {
    run = existing.data as RepairRun;
  } else {
    const { data, error } = await supabase
      .from("repair_runs")
      .insert({
        incident_id: i.id,
        source: i.source,
        client_slug: i.client_slug ?? null,
        // Tenant propagation (2026-07-02): migration 0054 backfilled historical
        // repair_runs.organization_id FROM ops_incidents, but new runs were
        // still inserted without it — every post-migration run had NULL org,
        // silently invisible to the org-filtered GET (route.ts S4 patch).
        organization_id: i.organization_id ?? null,
        policy,
        state: policy === "human_only" ? "human_only" : "detected",
        github_owner: target.owner,
        github_repo: target.repo,
        risk_level: i.severity === "critical" ? "critical" : i.severity === "high" ? "high" : "medium",
        // C5 fix: use the severityRequiresHumanReview helper (was inline duplicate). This
        // also closes the m9 "dead code with misleading docstring" finding — the helper is
        // now the SSOT for the critical-severity gate predicate.
        needs_human_review: policy !== "auto_repair" || severityRequiresHumanReview(i.severity),
        audit_log: appendAudit([], {
          actor: args.actor,
          action: "run_created",
          data: { source: args.source, policy },
        }),
        metadata: {
          incident_title: i.title,
          incident_fingerprint: i.fingerprint,
        },
      })
      .select("*")
      .single();
    if (error || !data) return { ok: false, error: "repair_run_insert_failed", details: error?.message };
    run = data as RepairRun;
  }

  if (!canApprovePolicy(run.policy)) {
    const updated = await updateRun(run.id, {
      state: "human_only",
      audit_log: appendAudit(run.audit_log, {
        actor: args.actor,
        action: "marked_human_only",
        detail: "Policy does not allow automated repair.",
      }),
    });
    return { ok: true, run: { ...(updated ?? run), incident: i as any } };
  }

  // C5 fix (pipeline gate, not just a flag): Plan v3.2 §四 explicitly calls critical-severity
  // a "閘門" (gate). Original code only set needs_human_review boolean but the pipeline
  // proceeded unconditionally to backup → issue → Claude repair. This gate now actually stops
  // the pipeline and requires a SECOND explicit operator confirmation via
  // POST /api/ops/repairs/<id>/confirm-critical (route guarded by canApproveCommand).
  // Bypass for drills: callers can pass forceCriticalApproval=true (only the
  // confirmCriticalRun callsite below does this).
  if (severityRequiresHumanReview(i.severity) && !args.forceCriticalApproval) {
    const updated = await updateRun(run.id, {
      state: "triage_needed",
      needs_human_review: true,
      audit_log: appendAudit(run.audit_log, {
        actor: args.actor,
        action: "critical_severity_gate_held",
        detail:
          "Critical-severity incident held at triage_needed per Plan v3.2 §四. Confirm via /ops/repairs UI → POST /api/ops/repairs/<id>/confirm-critical to proceed.",
        data: { severity: i.severity },
      }),
    });
    return {
      ok: true,
      run: { ...(updated ?? run), incident: i as any },
      error: "critical_requires_second_confirmation",
    };
  }

  const approvedAt = new Date().toISOString();
  const approved = await updateRun(run.id, {
    state: "backing_up",
    approved_by: args.actor,
    approved_at: approvedAt,
    backup_status: "running",
    audit_log: appendAudit(run.audit_log, {
      actor: args.actor,
      action: "approved",
      data: { source: args.source },
    }),
  });

  const backupRun = { ...(approved ?? run), incident: i as any } as RepairRunWithIncident;
  const backup = await runPreRepairBackup(backupRun);

  if (!backup.ok) {
    const failed = await updateRun(run.id, {
      state: "triage_needed",
      backup_status: "failed",
      backup_checked_at: new Date().toISOString(),
      backup_error: backup.error ?? "backup_failed",
      audit_log: appendAudit((approved ?? run).audit_log, {
        actor: "system",
        action: "backup_failed",
        detail: backup.error ?? "backup failed",
        data: backup.detail,
      }),
    });
    return { ok: false, run: { ...(failed ?? run), incident: i as any }, error: "backup_failed", details: backup };
  }

  const backedUp = await updateRun(run.id, {
    state: "approved",
    backup_status: "passed",
    backup_ref: backup.backupRef ?? null,
    backup_checked_at: new Date().toISOString(),
    backup_error: null,
    audit_log: appendAudit((approved ?? run).audit_log, {
      actor: "system",
      action: "backup_passed",
      data: { backup_ref: backup.backupRef, detail: backup.detail },
    }),
  });

  // M7: backup succeeded but state transition failed (Supabase network drop or row vanished).
  // Do NOT continue — proceeding with stale `run` (old state) would corrupt DB state machine,
  // skipping "approved" entirely and landing on "repairing" directly. Operator must fix via UI.
  if (!backedUp) {
    console.error(
      `[repair] run ${run.id}: backup passed (ref: ${backup.backupRef ?? "unknown"}) but ` +
      `state transition to "approved" failed. Run stuck at backing_up. Manual intervention required.`
    );
    return {
      ok: false,
      run: { ...run, incident: i as any },
      error: "state_transition_failed_after_backup",
      details: {
        backup_ref: backup.backupRef,
        hint: "Backup succeeded. Update run state to 'approved' manually via /ops/repairs UI.",
      },
    };
  }

  const runForIssue = { ...backedUp, incident: i as any } as RepairRunWithIncident;
  if (!needsGitHubIssue(runForIssue.policy)) {
    const updated = await updateRun(run.id, {
      state: "human_only",
      audit_log: appendAudit(runForIssue.audit_log, {
        actor: "system",
        action: "issue_skipped",
        detail: "Policy does not require GitHub handoff.",
      }),
    });
    return { ok: true, run: { ...(updated ?? run), incident: i as any } };
  }

  const issue = await createRepairIssue(runForIssue);
  if (!issue.ok) {
    const failed = await updateRun(run.id, {
      state: "triage_needed",
      audit_log: appendAudit(runForIssue.audit_log, {
        actor: "system",
        action: "github_issue_failed",
        detail: issue.error,
        data: { detail: issue.detail },
      }),
    });
    return { ok: false, run: { ...(failed ?? run), incident: i as any }, error: "github_issue_failed", details: issue };
  }

  const repaired = await updateRun(run.id, {
    state: "repairing",
    github_owner: issue.owner ?? target.owner,
    github_repo: issue.repo ?? target.repo,
    github_issue_number: issue.number ?? null,
    github_issue_url: issue.url ?? null,
    deploy_status: "not_started",
    audit_log: appendAudit(runForIssue.audit_log, {
      actor: "system",
      action: "github_issue_created",
      data: { issue_number: issue.number, issue_url: issue.url },
    }),
  });

  // Mirror M7: if the repairing state transition itself failed (network drop /
  // row vanished), do not proceed to auto-remediation — the run is in an
  // unknown state. Operator must fix via UI, same as the backing_up → approved gap.
  if (!repaired) {
    console.error(
      `[repair] run ${run.id}: state transition to "repairing" failed. Auto-remediation skipped.`,
    );
    return {
      ok: false,
      run: { ...run, incident: i as any },
      error: "state_transition_failed_at_repairing",
      details: { hint: "Update run state to 'repairing' manually via /ops/repairs UI." },
    };
  }

  // Auto-remediation: if a catalog entry matches and the flag is on, attempt
  // now rather than waiting for a human to click "Run Remediation". All safety
  // envelopes (flag gate, cooldown, precheck, healthcheck, audit) live inside
  // tryRemediate — this block only wires the run-state transitions.
  //
  // Catalog matchers must be pure functions: the pre-check here and tryRemediate's
  // internal match must see identical results. No stateful or time-dependent matchers.
  if (findRemediation(i)) {
    const rem = await tryRemediate(supabase, i, { mode: "auto", actor: "system" });
    if (rem.attempted && rem.ok) {
      // Conditional UPDATE (.eq("state","repairing")) guards against a lost-write
      // race: an operator could click "Mark Deploy Pending" in the ~60s window
      // while remediation was running SSH + healthcheck. Mirrors escalateAnalysisOnlyRun's
      // atomic conditional pattern. If the guard fails (returns null), the operator's
      // action was already in flight — return the repairing row; next UI reload corrects.
      const { data: resolvedData } = await supabase
        .from("repair_runs")
        .update({
          state: "resolved",
          deploy_status: "passed",
          deploy_ref: `catalog:${rem.key}`,
          deploy_checked_at: new Date().toISOString(),
          audit_log: appendAudit(repaired.audit_log, {
            actor: "system",
            action: "catalog_remediation_success",
            data: {
              key: rem.key,
              action_run_id: rem.action_run_id,
              steps: rem.steps,
            },
          }),
        })
        .eq("id", run.id)
        .eq("state", "repairing")
        .select("*")
        .maybeSingle();
      const autoResolved = resolvedData as RepairRun | null;
      return { ok: true, run: { ...(autoResolved ?? repaired), incident: i as any } };
    }
    if (rem.attempted && !rem.ok) {
      const { data: failedData } = await supabase
        .from("repair_runs")
        .update({
          state: "triage_needed",
          deploy_status: "failed",
          audit_log: appendAudit(repaired.audit_log, {
            actor: "system",
            action: "catalog_remediation_failed",
            data: {
              key: rem.key,
              reason: rem.reason,
              action_run_id: rem.action_run_id,
              steps: rem.steps,
            },
          }),
        })
        .eq("id", run.id)
        .eq("state", "repairing")
        .select("*")
        .maybeSingle();
      const autoFailed = failedData as RepairRun | null;
      return {
        ok: false,
        run: { ...(autoFailed ?? repaired), incident: i as any },
        error: "catalog_remediation_failed",
      };
    }
    // !rem.attempted (flag off / cooldown / no_organization) → fall through to repairing
  }

  return { ok: true, run: { ...repaired, incident: i as any } };
}

/**
 * C5 fix companion: explicit second-confirmation path for critical-severity incidents
 * held at `triage_needed` by `startRepairFromIncident`. Operator must hit this from the
 * /ops/repairs UI (canApproveCommand-gated route) to clear the gate.
 *
 * Reuses `startRepairFromIncident` with `forceCriticalApproval=true` so the backup +
 * GitHub-issue + Claude-repair pipeline executes the same way as a non-critical run.
 */
export async function confirmCriticalRun(args: {
  runId: string;
  actor: string;
}): Promise<{ ok: boolean; run?: RepairRunWithIncident; error?: string; details?: unknown; blockedMode?: string }> {
  const run = await fetchRepairRunWithIncident(args.runId);
  if (!run) return { ok: false, error: "repair_run_not_found" };
  if (!run.needs_human_review) return { ok: false, error: "run_not_in_critical_review_hold" };
  if (run.state !== "triage_needed") return { ok: false, error: "run_not_in_triage_needed_state", details: { state: run.state } };

  // Audit the explicit confirmation BEFORE re-entering the pipeline.
  await updateRun(args.runId, {
    audit_log: appendAudit(run.audit_log, {
      actor: args.actor,
      action: "critical_severity_gate_confirmed",
      detail: "Operator explicitly confirmed critical-severity repair via /confirm-critical route.",
    }),
  });

  return startRepairFromIncident({
    incidentId: run.incident_id,
    actor: args.actor,
    source: "web",
    forceCriticalApproval: true,
  });
}

export async function updateRun(id: string, patch: Record<string, unknown>): Promise<RepairRun | null> {
  const supabase = getSupabaseWriteClient();
  if (!supabase) return null;
  const { data } = await supabase.from("repair_runs").update(patch).eq("id", id).select("*").maybeSingle();
  return (data as RepairRun | null) ?? null;
}

export async function markRunHumanOnly(id: string, actor: string, reason: string) {
  const run = await fetchRepairRunWithIncident(id);
  if (!run) return { ok: false, error: "repair_run_not_found" };
  const updated = await updateRun(id, {
    state: "human_only",
    needs_human_review: true,
    audit_log: appendAudit(run.audit_log, {
      actor,
      action: "marked_human_only",
      detail: reason || "Marked from Repair Center.",
    }),
  });
  return { ok: true, run: updated };
}

export async function escalateAnalysisOnlyRun(
  id: string,
  actor: string,
): Promise<{ ok: boolean; run?: RepairRun; error?: string; details?: unknown }> {
  const supabase = getSupabaseWriteClient();
  if (!supabase) return { ok: false, error: "supabase_write_not_configured" };

  const run = await fetchRepairRunWithIncident(id);
  if (!run) return { ok: false, error: "repair_run_not_found" };

  const catalog = policyCatalogForSource(run.source);
  const guard = escalateGuard(run, catalog.can_escalate_to_pr);
  if (!guard.can) return { ok: false, error: guard.reason, details: guard.reason === "run_in_terminal_state" ? { state: run.state } : undefined };

  const newAuditLog = appendAudit(run.audit_log, {
    actor,
    action: "escalated_to_auto_repair",
    detail: "Operator confirmed code-regression root cause; escalated from analysis_only to auto_repair.",
  });
  // M9 fix: atomic conditional UPDATE — only succeeds if policy is still 'analysis_only'
  // and the run has not been moved to a terminal state by a concurrent request.
  const terminalList = `(${TERMINAL_STATES.map((s) => `"${s}"`).join(",")})`;
  const { data: updated, error: updateError } = await supabase
    .from("repair_runs")
    .update({ policy: "auto_repair", audit_log: newAuditLog })
    .eq("id", id)
    .eq("policy", "analysis_only")
    .not("state", "in", terminalList)
    .select("*")
    .maybeSingle();

  if (updateError) return { ok: false, error: "update_failed", details: updateError.message };
  if (!updated) return { ok: false, error: "state_conflict_concurrent_modify" };

  if (run.github_issue_number && run.github_owner && run.github_repo) {
    await postEscalationComment({
      owner: run.github_owner,
      repo: run.github_repo,
      issueNumber: run.github_issue_number,
      actor,
    }).catch(() => {});
  }

  return { ok: true, run: updated as RepairRun };
}

export async function updateRunLinks(
  id: string,
  actor: string,
  body: {
    github_pr_url?: string;
    github_issue_url?: string;
    deploy_ref?: string;
    state?: string;
    deploy_status?: string;
  },
) {
  const run = await fetchRepairRunWithIncident(id);
  if (!run) return { ok: false, error: "repair_run_not_found" };

  // M1: validate state against known enum; block writes to terminal runs.
  if (body.state) {
    if (!(REPAIR_RUN_STATES as readonly string[]).includes(body.state)) {
      return { ok: false, error: "invalid_state_value", details: { received: body.state, allowed: [...REPAIR_RUN_STATES] } };
    }
    // m6: use strict version — run.state is string (DB NOT NULL); undefined must not pass as "terminal".
    // Exception (2026-07-03): human_only → resolved is the 結案 button's transition —
    // visibleRunButtons() only shows 結案 on human_only runs, so blocking it made every
    // click dead-end with run_in_terminal_state. Only this one transition is exempt;
    // all other writes to terminal runs stay blocked (no state resurrection).
    const isCloseHumanOnly = run.state === "human_only" && body.state === "resolved";
    if (isStrictTerminalState(run.state) && !isCloseHumanOnly) {
      return { ok: false, error: "run_in_terminal_state", details: { state: run.state } };
    }
  }
  // M1: validate deploy_status against known enum.
  if (body.deploy_status && !(REPAIR_DEPLOY_STATUSES as readonly string[]).includes(body.deploy_status)) {
    return { ok: false, error: "invalid_deploy_status_value", details: { received: body.deploy_status, allowed: [...REPAIR_DEPLOY_STATUSES] } };
  }

  const patch: Record<string, unknown> = {};
  if (body.github_pr_url !== undefined) {
    const trimmedPrUrl = body.github_pr_url.trim();
    // m7: reject non-github.com PR URLs to prevent javascript: or SSRF injection.
    if (trimmedPrUrl) {
      try {
        const parsed = new URL(trimmedPrUrl);
        if (parsed.hostname !== "github.com") {
          return { ok: false, error: "invalid_github_pr_url_hostname", details: { hostname: parsed.hostname } };
        }
      } catch {
        return { ok: false, error: "invalid_github_pr_url_format" };
      }
    }
    patch.github_pr_url = trimmedPrUrl || null;
    const match = trimmedPrUrl.match(/\/pull\/(\d+)/);
    patch.github_pr_number = match ? Number(match[1]) : null;
    patch.state = trimmedPrUrl ? "pr_ready" : run.state;
  }
  if (body.github_issue_url !== undefined) patch.github_issue_url = body.github_issue_url.trim() || null;
  if (body.deploy_ref !== undefined) {
    patch.deploy_ref = body.deploy_ref.trim() || null;
    patch.deploy_checked_at = new Date().toISOString();
  }
  if (body.state) patch.state = body.state;
  if (body.deploy_status) patch.deploy_status = body.deploy_status;
  patch.audit_log = appendAudit(run.audit_log, {
    actor,
    action: "links_updated",
    data: body as Record<string, unknown>,
  });

  const updated = await updateRun(id, patch);
  return { ok: true, run: updated };
}

export async function archiveRun(id: string, actor: string): Promise<{ ok: boolean; run?: RepairRun; error?: string }> {
  const supabase = getSupabaseWriteClient();
  if (!supabase) return { ok: false, error: "supabase_write_not_configured" };

  const run = await fetchRepairRunWithIncident(id);
  if (!run) return { ok: false, error: "repair_run_not_found" };
  // Strict write gate (m6-ext). DB enforces NOT NULL since migration 0027, but the !run.state
  // check stays: it satisfies TS control-flow narrowing before the string-typed isStrictTerminalState
  // call, and guards against test fixtures / future schema drift without costing anything.
  if (!run.state || !isStrictTerminalState(run.state)) return { ok: false, error: "run_not_in_terminal_state" };
  if (run.archived_at) return { ok: true, run: run as RepairRun };

  const updated = await updateRun(id, {
    archived_at: new Date().toISOString(),
    audit_log: appendAudit(run.audit_log, {
      actor,
      action: "archived",
      detail: "Manually archived from Repair Center.",
    }),
  });
  return { ok: true, run: updated ?? undefined };
}

export async function archiveStaleRuns(retentionDays = 90): Promise<{ ok: boolean; archived?: number; error?: string }> {
  const supabase = getSupabaseWriteClient();
  if (!supabase) return { ok: false, error: "supabase_write_not_configured" };

  const { data, error } = await supabase.rpc("archive_stale_repair_runs", { retention_days: retentionDays });
  if (error) return { ok: false, error: error.message };
  return { ok: true, archived: data as number };
}
