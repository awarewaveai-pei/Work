import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { canApproveCommand, resolveOpsRole } from "@/lib/ops-role";
import { startRepairFromIncident } from "@/lib/repair-center/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 100;

  const { data, error } = await supabase
    .from("repair_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ ok: false, error: "repair_runs_fetch_failed", details: error.message }, { status: 409 });
  return NextResponse.json({ ok: true, runs: data ?? [], role: resolveOpsRole(request).role });
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
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
