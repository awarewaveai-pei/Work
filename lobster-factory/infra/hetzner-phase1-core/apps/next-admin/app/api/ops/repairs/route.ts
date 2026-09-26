import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { canApproveCommand, canModifyIncidentStatus, resolveOpsRole } from "@/lib/ops-role";
import { effectiveOrgId, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { startRepairFromIncident } from "@/lib/repair-center/service";
import { blockedChangeResponse } from "@/lib/system-modes/blocked-change";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SSOT: agency-os/reports/audit/auto-repair-2026-05-23.md §Patch 3 (with Errata EMaj-3)
// Original audit C4: GET handler had no role guard AND used select("*") which returned
// audit_log column (SSH stdout/stderr up to 6KB) to default viewers.
//
// EMaj-3 reframe: primary fix = column allow-list (drops audit_log from list view).
// canModifyIncidentStatus includes 'viewer' role by design, so role guard alone is not
// sufficient — column allow-list is the real protection. Role guard is defense-in-depth
// against the default_viewer fallback (anonymous requests resolved to viewer when no
// claims header is present).
const LIST_COLUMNS = [
  "id",
  "incident_id",
  "source",
  "client_slug",
  "policy",
  "state",
  "approved_by",
  "approved_at",
  "backup_status",
  "backup_ref",
  "backup_checked_at",
  "github_owner",
  "github_repo",
  "github_issue_number",
  "github_issue_url",
  "github_pr_number",
  "github_pr_url",
  "deploy_status",
  "deploy_ref",
  "deploy_checked_at",
  "risk_level",
  "needs_human_review",
  "created_at",
  "updated_at",
  "archived_at",
].join(",");

export async function GET(request: Request) {
  // Errata EMaj-3 defense-in-depth: block default_viewer fallback (anonymous/no-claims requests).
  // Legitimate operator UI passes claims headers via middleware; CI/curl-without-auth resolves
  // to default_viewer and now gets 403 instead of reading the queue.
  const resolved = resolveOpsRole(request);
  if (!canModifyIncidentStatus(resolved.role) || resolved.source === "default_viewer") {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 100;
  const clientSlug = searchParams.get("client_slug")?.trim() || null;

  let orgFilter: string | null;
  try { orgFilter = effectiveOrgId(request, null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  let query = supabase
    .from("repair_runs")
    // Primary C4 fix: explicit column allow-list — audit_log NEVER returned in list view.
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (orgFilter) query = query.eq("organization_id", orgFilter);
  if (clientSlug) query = query.eq("client_slug", clientSlug);
  const { data, error } = await query;

  if (error) return NextResponse.json({ ok: false, error: "repair_runs_fetch_failed", details: error.message }, { status: 409 });
  return NextResponse.json({ ok: true, runs: data ?? [], role: resolved.role });
}

export async function POST(request: Request) {
  const resolved = resolveOpsRole(request);
  if (!canApproveCommand(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  let body: { incident_id?: string };
  try {
    body = (await request.json()) as { incident_id?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.incident_id) return NextResponse.json({ ok: false, error: "incident_id_required" }, { status: 400 });

  const result = await startRepairFromIncident({
    incidentId: body.incident_id,
    actor: resolved.role,
    source: "web",
  });
  if (result.blockedMode !== undefined) return blockedChangeResponse(result.blockedMode);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
