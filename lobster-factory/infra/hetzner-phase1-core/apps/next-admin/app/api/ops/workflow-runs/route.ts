import { NextResponse } from "next/server";
import { getSupabaseReadClient } from "../../../../lib/supabase-server";

export async function GET(request: Request) {
  const supabase = getSupabaseReadClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_read_not_configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 20;

  const { data, error } = await supabase
    .from("ops_action_runs")
    .select("id,organization_id,action_id,status,approval_status,trace_id,started_at,ended_at,organizations(slug)")
    .order("started_at", { ascending: false })
    .limit(limit);

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
    startedAt: row.started_at,
    endedAt: row.ended_at,
  }));

  return NextResponse.json({
    ok: true,
    runs,
    count: runs.length,
  });
}
