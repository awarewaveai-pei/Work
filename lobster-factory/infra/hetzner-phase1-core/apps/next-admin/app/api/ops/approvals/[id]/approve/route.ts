// POST /api/ops/approvals/:id/approve
// Approves a high/critical-risk command_request that landed in status='queued'.
// Runs the registered handler directly (bypassing commandRouter's killswitch
// check — that bypass is intentional for /normal_mode which IS the unlock path).
//
// RBAC: owner + admin only. Records approver in metadata.approved_by/at/role.
//
// Phase 2c (2026-05-08).

import { NextResponse } from "next/server";
import { canApproveCommand, resolveOpsRole } from "../../../../../../lib/ops-role";
import { getSupabaseWriteClient } from "../../../../../../lib/supabase-server";
import { phase1Handlers } from "../../../../../../lib/command-plane/handlers";
import type { CommandRequestRow } from "../../../../../../lib/command-plane/types";

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

  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "supabase_write_not_configured" },
      { status: 503 },
    );
  }

  // Fetch the command_request and verify it's eligible for approval.
  const { data: row, error: fetchErr } = await supabase
    .from("command_requests")
    .select("*")
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

  if (row.risk_level !== "high" && row.risk_level !== "critical") {
    return NextResponse.json(
      { ok: false, error: "not_high_risk", risk_level: row.risk_level },
      { status: 400 },
    );
  }

  const handler = phase1Handlers[row.command];
  if (!handler) {
    // Mark as failed — operator approved but no handler registered.
    await supabase
      .from("command_requests")
      .update({
        status: "failed",
        rejection_reason: "no_handler_for_approved_command",
        resolved_at: new Date().toISOString(),
        metadata: {
          ...((row.metadata ?? {}) as Record<string, unknown>),
          approved_by_role: resolved.role,
          approval_failed_reason: "no_handler_registered",
        },
      })
      .eq("id", id);
    return NextResponse.json(
      { ok: false, error: "no_handler_registered", command: row.command },
      { status: 422 },
    );
  }

  // Mark dispatched, then run handler, then mark completed/failed.
  // (Approver identity captured in metadata; ops_audit_events row left to Phase 3
  // — current MVP keeps to command_requests row only to avoid extra schema work.)
  const approvedAt = new Date().toISOString();
  const approverRole = resolved.role;

  await supabase
    .from("command_requests")
    .update({
      status: "dispatched",
      metadata: {
        ...((row.metadata ?? {}) as Record<string, unknown>),
        approved_by_role: approverRole,
        approved_at: approvedAt,
        approval_action: "approved",
      },
    })
    .eq("id", id);

  try {
    const result = await handler(row as CommandRequestRow, { supabase });
    await supabase
      .from("command_requests")
      .update({
        status: "completed",
        result,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", id);
    return NextResponse.json({ ok: true, command_request_id: id, status: "completed", result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from("command_requests")
      .update({
        status: "failed",
        rejection_reason: "handler_threw",
        resolved_at: new Date().toISOString(),
        metadata: {
          ...((row.metadata ?? {}) as Record<string, unknown>),
          approved_by_role: approverRole,
          approved_at: approvedAt,
          approval_action: "approved",
          handler_error: msg,
        },
      })
      .eq("id", id);
    return NextResponse.json(
      { ok: false, error: "handler_threw", details: msg, command_request_id: id },
      { status: 500 },
    );
  }
}
