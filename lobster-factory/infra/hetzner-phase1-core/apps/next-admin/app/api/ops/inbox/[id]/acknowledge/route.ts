import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { canModifyIncidentStatus, resolveOpsRole } from "@/lib/ops-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const resolved = resolveOpsRole(request);
  if (!canModifyIncidentStatus(resolved.role) || resolved.source === "default_viewer") {
    return NextResponse.json({ ok: false, error: "forbidden_role" }, { status: 403 });
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "supabase_write_not_configured" }, { status: 503 });

  const { data: incident, error: fetchError } = await supabase
    .from("ops_incidents")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ ok: false, error: "incident_fetch_failed" }, { status: 409 });
  if (!incident) return NextResponse.json({ ok: false, error: "incident_not_found" }, { status: 404 });
  if (incident.status === "resolved") return NextResponse.json({ ok: true, already_resolved: true });

  const { error: updateError } = await supabase
    .from("ops_incidents")
    .update({ status: "resolved" })
    .eq("id", id);

  if (updateError) return NextResponse.json({ ok: false, error: "acknowledge_failed", details: updateError.message }, { status: 409 });
  return NextResponse.json({ ok: true });
}
