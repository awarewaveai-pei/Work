import { NextResponse } from "next/server";
import { canApproveCommand, resolveOpsRole } from "@/lib/ops-role";
import { confirmCriticalRun } from "@/lib/repair-center/service";
import { blockedChangeResponse } from "@/lib/system-modes/blocked-change";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * C5 fix (Plan v3.2 §四 critical-severity gate): second-confirmation endpoint.
 * Runs held at `triage_needed` with `needs_human_review=true` after the first Approve
 * tap on a critical incident must be confirmed here before backup/issue/Claude pipeline
 * proceeds. canApproveCommand-gated (owner/admin only), not callable by viewer/operator.
 *
 * SSOT: agency-os/reports/audit/auto-repair-2026-05-23.md §C5
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canApproveCommand(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  const { id } = await params;
  const result = await confirmCriticalRun({ runId: id, actor: resolved.role });
  if (result.blockedMode !== undefined) return blockedChangeResponse(result.blockedMode);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
