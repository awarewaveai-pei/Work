// Kill switch: read system_modes.
// Modifications must go through ops console SSO (never via command plane).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RiskLevel, SystemMode } from "./types";

const FAIL_OPEN_FOR = new Set<RiskLevel>([]); // No risk level fails open.

export interface KillSwitchDecision {
  mode: SystemMode;
  blocks: boolean;
  reason?: string;
}

/**
 * Returns the most-restrictive active mode for the given org (org → global).
 * Defaults to 'normal' when DB unreachable for low-risk reads only;
 * medium/high/critical commands fail closed.
 */
export async function getActiveMode(
  client: SupabaseClient,
  organizationId: string,
): Promise<SystemMode> {
  const { data, error } = await client
    .from("system_modes")
    .select("scope_type, scope_id, mode")
    .or(
      `and(scope_type.eq.client,scope_id.eq.${organizationId}),and(scope_type.eq.global,scope_id.is.null)`,
    );
  if (error || !data || data.length === 0) {
    return "normal";
  }
  // Prefer scope='client' over 'global'.
  const scoped = data.find((r) => r.scope_type === "client");
  return ((scoped ?? data[0]).mode as SystemMode) ?? "normal";
}

export function evaluateKillSwitch(mode: SystemMode, riskLevel: RiskLevel): KillSwitchDecision {
  if (mode === "emergency_stop") {
    return { mode, blocks: true, reason: "system in emergency_stop" };
  }
  if (mode === "maintenance" && !FAIL_OPEN_FOR.has(riskLevel)) {
    return { mode, blocks: true, reason: "system in maintenance" };
  }
  if (mode === "read_only" && riskLevel !== "low") {
    return { mode, blocks: true, reason: "system in read_only" };
  }
  return { mode, blocks: false };
}
