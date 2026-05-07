// Idempotency: rely on the (source, source_event_id) unique constraint
// in command_requests. Insert; catch 23505 (Postgres unique_violation);
// re-fetch the existing row.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommandRequestRow, CommandStatus, NormalizedCommand, RiskLevel } from "./types";

export interface ClaimResult {
  request: CommandRequestRow;
  isNew: boolean;
}

export async function claimCommandRequest(
  client: SupabaseClient,
  input: NormalizedCommand,
  riskLevel: RiskLevel,
): Promise<ClaimResult> {
  const { data, error } = await client
    .from("command_requests")
    .insert({
      organization_id: input.organizationId,
      workspace_id: input.workspaceId,
      source: input.source,
      source_event_id: input.sourceEventId,
      actor_type: input.actorType,
      actor_ref: input.actorRef,
      command: input.command,
      args: input.args,
      risk_level: riskLevel,
      status: "received" satisfies CommandStatus,
      metadata: input.metadata,
    })
    .select("*")
    .single();

  if (!error && data) {
    return { request: data as CommandRequestRow, isNew: true };
  }

  // Duplicate (idempotency hit).
  const isUniqueViolation =
    error?.code === "23505" || /duplicate key/i.test(error?.message ?? "");
  if (!isUniqueViolation) {
    throw new Error(
      `claimCommandRequest insert failed: ${error?.code ?? "unknown"} ${error?.message ?? ""}`,
    );
  }

  const { data: existing, error: fetchErr } = await client
    .from("command_requests")
    .select("*")
    .eq("source", input.source)
    .eq("source_event_id", input.sourceEventId)
    .single();
  if (fetchErr || !existing) {
    throw new Error(
      `claimCommandRequest could not refetch existing: ${fetchErr?.message ?? "not found"}`,
    );
  }
  return { request: existing as CommandRequestRow, isNew: false };
}

export async function updateRequestStatus(
  client: SupabaseClient,
  id: string,
  patch: Partial<{
    status: CommandStatus;
    workflow_run_id: string | null;
    approval_id: string | null;
    rejection_reason: string | null;
    result: Record<string, unknown>;
    resolved_at: string | null;
  }>,
): Promise<void> {
  const { error } = await client.from("command_requests").update(patch).eq("id", id);
  if (error) {
    throw new Error(`updateRequestStatus failed: ${error.message}`);
  }
}
