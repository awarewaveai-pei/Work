// POST /api/ops/approvals/:id/reject
// Rejects a queued high/critical-risk command_request. No handler runs.
// RBAC: owner + admin only.
// Phase 2c (2026-05-08).

import { NextResponse } from "next/server";
import { canApproveCommand, resolveOpsRole } from "../../../../../../lib/ops-role";
import { getSupabaseWriteClient } from "../../../../../../lib/supabase-server";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canApproveCommand(resolved.role)) {
    return NextResponse.json(
      { ok: false, error: "forbidden_role", role: resolved.role },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ ok: false, error: "command_request_id_must_be_uuid" }, { status: 400 });
  }

  let body: { reason?: string } = {};
  try {
    body = (await request.json()) as { reason?: string };
  } catch {
    body = {};
  }
  const reason = (body.reason ?? "rejected_by_ops_console").slice(0, 500);

  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "supabase_write_not_configured" },
      { status: 503 },
    );
  }

  const { data: row, error: fetchErr } = await supabase
    .from("command_requests")
    .select("id,status,risk_level,metadata")
    .eq("id", id)
    .single();

  if (fetchErr || !row) {
    return NextResponse.json(
      { ok: false, error: "command_request_not_found", details: fetchErr?.message },
      { status: 404 },
    );
  }

  if (row.status !== "queued") {
    return NextResponse.json(
      { ok: false, error: "not_queued", current_status: row.status },
      { status: 409 },
    );
  }

  const { error: updateErr } = await supabase
    .from("command_requests")
    .update({
      status: "blocked_by_policy",
      rejection_reason: reason,
      resolved_at: new Date().toISOString(),
      metadata: {
        ...((row.metadata ?? {}) as Record<string, unknown>),
        approved_by_role: resolved.role,
        approved_at: new Date().toISOString(),
        approval_action: "rejected",
        rejection_reason_text: reason,
      },
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json(
      { ok: false, error: "update_failed", details: updateErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, command_request_id: id, status: "blocked_by_policy", reason });
}
