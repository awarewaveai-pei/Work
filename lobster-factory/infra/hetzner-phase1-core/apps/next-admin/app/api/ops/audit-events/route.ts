import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabase-server";

export async function GET(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 20;
  const organizationId = searchParams.get("organization_id");
  const traceId = searchParams.get("trace_id");
  const eventType = searchParams.get("event_type");

  let query = supabase
    .from("ops_audit_events")
    .select("id,organization_id,event_type,target_type,target_id,trace_id,created_at,payload")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (organizationId) query = query.eq("organization_id", organizationId);
  if (traceId) query = query.eq("trace_id", traceId);
  if (eventType) query = query.eq("event_type", eventType);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: "audit_events_fetch_failed", details: error.message }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    events: data ?? [],
    count: (data ?? []).length,
  });
}

