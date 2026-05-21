import { getSupabaseServerClient, getSupabaseWriteClient } from "@/lib/supabase-server";
import type { Incident } from "@/lib/ops-inbox/types";
import { appendAudit } from "./audit";
import { runPreRepairBackup } from "./backup";
import { createRepairIssue, postEscalationComment, resolveGithubTarget } from "./github";
import { canApprovePolicy, needsGitHubIssue, policyCatalogForSource, policyForIncident } from "./policy";
import type { RepairRun, RepairRunWithIncident } from "./types";

export async function getCurrentSystemMode(): Promise<string> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return "unknown";
  const { data } = await supabase
    .from("system_modes")
    .select("mode")
    .eq("scope_type", "global")
    .is("scope_id", null)
    .maybeSingle();
  return String((data as any)?.mode ?? "normal");
}

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
  source: "web" | "slack";
}): Promise<{ ok: boolean; run?: RepairRunWithIncident; error?: string; details?: unknown }> {
  const mode = await getCurrentSystemMode();
  if (mode !== "normal") {
    return { ok: false, error: "system_mode_blocks_repair", details: { mode } };
  }

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
        policy,
        state: policy === "human_only" ? "human_only" : "detected",
        github_owner: target.owner,
        github_repo: target.repo,
        risk_level: i.severity === "critical" ? "critical" : i.severity === "high" ? "high" : "medium",
        needs_human_review: policy !== "auto_repair" || i.severity === "critical",
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

  const runForIssue = { ...(backedUp ?? run), incident: i as any } as RepairRunWithIncident;
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

  return { ok: true, run: { ...(repaired ?? run), incident: i as any } };
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

  if (run.policy !== "analysis_only") return { ok: false, error: "not_analysis_only" };
  const catalog = policyCatalogForSource(run.source);
  if (!catalog.can_escalate_to_pr) return { ok: false, error: "source_cannot_escalate" };
  const terminal = ["resolved", "rolled_back", "human_only"];
  if (terminal.includes(run.state)) return { ok: false, error: "run_in_terminal_state", details: { state: run.state } };

  const updated = await updateRun(id, {
    policy: "auto_repair",
    audit_log: appendAudit(run.audit_log, {
      actor,
      action: "escalated_to_auto_repair",
      detail: "Operator confirmed code-regression root cause; escalated from analysis_only to auto_repair.",
    }),
  });

  if (run.github_issue_number && run.github_owner && run.github_repo) {
    await postEscalationComment({
      owner: run.github_owner,
      repo: run.github_repo,
      issueNumber: run.github_issue_number,
      actor,
    }).catch(() => {});
  }

  return { ok: true, run: updated ?? undefined };
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

  const patch: Record<string, unknown> = {};
  if (body.github_pr_url !== undefined) {
    patch.github_pr_url = body.github_pr_url.trim() || null;
    const match = body.github_pr_url.match(/\/pull\/(\d+)/);
    patch.github_pr_number = match ? Number(match[1]) : null;
    patch.state = body.github_pr_url.trim() ? "pr_ready" : run.state;
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
