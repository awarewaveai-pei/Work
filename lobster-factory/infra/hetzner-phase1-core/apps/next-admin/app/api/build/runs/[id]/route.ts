import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "../../../../../lib/supabase-server";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "../../../../../lib/tenant-guard";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "supabase_not_configured" },
      { status: 503 }
    );
  }

  const { data: run, error } = await supabase
    .from("ops_action_runs")
    .select("id, status, trigger_run_id, error_summary, started_at, ended_at, metadata, output_payload, organization_id")
    .eq("id", id)
    .single();

  if (error || !run) {
    return NextResponse.json(
      { ok: false, error: "not_found", detail: error?.message },
      { status: 404 }
    );
  }
  try { assertOrgAccess(req, (run as Record<string, unknown>).organization_id as string | null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  return NextResponse.json({ ok: true, run });
}
