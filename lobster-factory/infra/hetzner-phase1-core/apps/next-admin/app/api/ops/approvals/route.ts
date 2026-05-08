// GET /api/ops/approvals
// Lists command_requests in status='queued' AND risk_level IN ('high', 'critical')
// — these are the items waiting for ops console approval. Phase 2c (2026-05-08).
//
// RBAC: read-only listing; canApproveCommand check enforced on POST endpoints
// /api/ops/approvals/[id]/approve and .../reject. Anyone with ops console access
// (any role including viewer) can SEE pending approvals; only owner/admin can act.

import { NextResponse } from "next/server";
import { getSupabaseReadClient } from "../../../../lib/supabase-server";
import { resolveOpsRole } from "../../../../lib/ops-role";

export async function GET(request: Request) {
  const supabase = getSupabaseReadClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "supabase_read_not_configured" },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;

  const { data, error } = await supabase
    .from("command_requests")
    .select(
      "id,organization_id,source,actor_type,actor_ref,command,args,risk_level,status,trace_id,received_at,metadata",
    )
    .eq("status", "queued")
    .in("risk_level", ["high", "critical"])
    .order("received_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { ok: false, error: "approvals_fetch_failed", details: error.message },
      { status: 409 },
    );
  }

  // Surface caller's role so the UI can hide the Approve button for non-owner/admin.
  const resolved = resolveOpsRole(request);

  return NextResponse.json({
    ok: true,
    role: resolved.role,
    role_source: resolved.source,
    pending: data ?? [],
    count: (data ?? []).length,
  });
}
