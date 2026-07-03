// POST /api/ops/repairs/reaper — flag stale mid-pipeline repair runs back to
// triage and close stale "running" ops_action_runs rows (A3 hygiene).
// The deploy webhook also calls reapStaleRuns opportunistically on every VPS
// deploy-cron heartbeat; this route exists for manual/cron invocation and
// drills. Same RBAC as archive-stale.

import { NextResponse } from "next/server";
import { canApproveCommand, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { reapStaleRuns } from "@/lib/repair-center/hygiene";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const resolved = resolveOpsRole(request);
  if (!canApproveCommand(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_write_not_configured" }, { status: 503 });
  }
  const result = await reapStaleRuns(supabase);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
