import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabase-server";
import { resolveOpsRole, canModifyIncidentStatus } from "../../../../lib/ops-role";
import { effectiveOrgId, OrgAccessError, toOrgAccessResponse } from "../../../../lib/tenant-guard";

export async function GET(request: Request) {
  const resolved = resolveOpsRole(request);
  if (!canModifyIncidentStatus(resolved.role) || resolved.source === "default_viewer") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 20;

  let orgFilter: string | null;
  try { orgFilter = effectiveOrgId(request, searchParams.get("organizationId")); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  let query = supabase
    .from("ops_action_runs")
    .select("id,organization_id,action_id,status,approval_status,trace_id,started_at,ended_at,metadata,organizations(slug)")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (orgFilter) query = query.eq("organization_id", orgFilter);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: "workflow_runs_fetch_failed", details: error.message }, { status: 409 });
  }

  const runs = (data ?? []).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    organizationSlug:
      typeof row.organizations === "object" && row.organizations && "slug" in row.organizations
        ? String(row.organizations.slug)
        : "unknown",
    actionId: row.action_id,
    status: row.status,
    approvalStatus: row.approval_status,
    traceId: row.trace_id,
    runSource:
      typeof row.metadata === "object" &&
      row.metadata &&
      "source" in row.metadata &&
      typeof row.metadata.source === "string"
        ? String(row.metadata.source).toLowerCase()
        : "unknown",
    startedAt: row.started_at,
    endedAt: row.ended_at,
  }));

  return NextResponse.json({
    ok: true,
    runs,
    count: runs.length,
  });
}
