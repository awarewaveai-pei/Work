// CommandRouter: the only entry point for normalised commands.
// Coordinates: idempotency claim → kill switch → policy → dispatch → record.
//
// Phase 1 design choice: command_requests IS the run record for inline
// (low-risk) handlers. workflow_runs is reserved for Phase 2 long-running
// dispatch (Trigger.dev). The columns command_request_id + idempotency_key
// added to workflow_runs in migration 0025 are for that future hookup.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type CommandRequestRow,
  type NormalizedCommand,
  type RouterResult,
} from "./types";
import { evaluatePolicy } from "./policyEngine";
import { evaluateKillSwitch, getActiveMode } from "./killSwitch";
import { claimCommandRequest, updateRequestStatus } from "./idempotency";
import { reportCommandError } from "./errorReporting";

export type CommandHandler = (
  request: CommandRequestRow,
  ctx: HandlerContext,
) => Promise<Record<string, unknown>>;

export interface HandlerContext {
  supabase: SupabaseClient;
}

export interface RouteOptions {
  handlers: Record<string, CommandHandler>;
  notifyApprovalRequest?: (request: CommandRequestRow) => Promise<void>;
}

export async function routeCommand(
  supabase: SupabaseClient,
  input: NormalizedCommand,
  opts: RouteOptions,
): Promise<RouterResult> {
  // 1) Policy classification (synchronous; no DB reads).
  const decision = evaluatePolicy(input.command, input.source, input.args);

  // 2) Idempotency claim (writes command_request, status='received').
  let claim;
  try {
    claim = await claimCommandRequest(supabase, input, decision.riskLevel);
  } catch (err) {
    await reportCommandError(supabase, {
      organizationId: input.organizationId,
      source_type: "command_ingress_failed",
      source_ref: `${input.source}:${input.sourceEventId}`,
      error_code: "claim_failed",
      error_message: err instanceof Error ? err.message : String(err),
      event_payload: { command: input.command, source: input.source },
    });
    throw err;
  }

  const { request, isNew } = claim;
  if (!isNew) {
    return {
      traceId: request.trace_id,
      status: request.status,
      commandRequestId: request.id,
      reason: "already_processed",
      result: request.result ?? {},
    };
  }

  // 3) Kill switch.
  const mode = await getActiveMode(supabase, input.organizationId);
  const ks = evaluateKillSwitch(mode, decision.riskLevel);
  if (ks.blocks) {
    await updateRequestStatus(supabase, request.id, {
      status: "blocked_by_killswitch",
      rejection_reason: ks.reason ?? `mode=${mode}`,
      resolved_at: new Date().toISOString(),
    });
    return {
      traceId: request.trace_id,
      status: "blocked_by_killswitch",
      commandRequestId: request.id,
      reason: ks.reason,
    };
  }

  // 4) Policy block.
  if (decision.outcome === "block") {
    await updateRequestStatus(supabase, request.id, {
      status: "blocked_by_policy",
      rejection_reason: decision.reason ?? "policy_block",
      resolved_at: new Date().toISOString(),
    });
    return {
      traceId: request.trace_id,
      status: "blocked_by_policy",
      commandRequestId: request.id,
      reason: decision.reason,
    };
  }

  // 5) Approval required (Phase 2 wires this to ops console UI).
  if (decision.outcome === "require_approval") {
    await updateRequestStatus(supabase, request.id, {
      status: "queued",
    });
    if (opts.notifyApprovalRequest) {
      await opts.notifyApprovalRequest(request).catch(() => {
        /* swallow: notification is best-effort */
      });
    }
    return {
      traceId: request.trace_id,
      status: "queued",
      commandRequestId: request.id,
      reason: "approval_required",
    };
  }

  // 6) Dispatch low-risk handler inline.
  const handler = opts.handlers[input.command];
  if (!handler) {
    await updateRequestStatus(supabase, request.id, {
      status: "blocked_by_policy",
      rejection_reason: "no_handler_registered",
      resolved_at: new Date().toISOString(),
    });
    return {
      traceId: request.trace_id,
      status: "blocked_by_policy",
      commandRequestId: request.id,
      reason: "no_handler_registered",
    };
  }

  await updateRequestStatus(supabase, request.id, { status: "dispatched" });

  try {
    const result = await handler(request, { supabase });
    await updateRequestStatus(supabase, request.id, {
      status: "completed",
      result,
      resolved_at: new Date().toISOString(),
    });
    return {
      traceId: request.trace_id,
      status: "completed",
      commandRequestId: request.id,
      result,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await reportCommandError(supabase, {
      organizationId: input.organizationId,
      source_type: "command_handler_failed",
      source_ref: request.id,
      error_code: "handler_threw",
      error_message: msg,
      event_payload: { command: input.command, trace_id: request.trace_id },
      trace_ref: request.trace_id,
    });
    await updateRequestStatus(supabase, request.id, {
      status: "failed",
      rejection_reason: msg.slice(0, 500),
      resolved_at: new Date().toISOString(),
    });
    return {
      traceId: request.trace_id,
      status: "failed",
      commandRequestId: request.id,
      reason: msg.slice(0, 500),
    };
  }
}
