// Kill switch: read system_modes.
// Modifications must go through ops console SSO (never via command plane).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModeLookup, RiskLevel, SystemMode } from "./types";

// Exported (not just module-private) so tests can inject a fail-open risk level without a real DB.
export const FAIL_OPEN_FOR = new Set<RiskLevel>([]); // Empty: nothing fails open, including while system_modes is unreadable.

export interface KillSwitchDecision {
  mode: ModeLookup;
  blocks: boolean;
  reason?: string;
}

// emergency_stop > maintenance > read_only > normal. maintenance outranks
// read_only because FAIL_OPEN_FOR is empty: maintenance blocks every risk
// level while read_only only blocks non-low.
const MODE_STRICTNESS: Record<SystemMode, number> = {
  normal: 0,
  read_only: 1,
  maintenance: 2,
  emergency_stop: 3,
};

function stricterOf(a: SystemMode, b: SystemMode): SystemMode {
  return MODE_STRICTNESS[b] > MODE_STRICTNESS[a] ? b : a;
}

/**
 * Returns the most-restrictive of the client-scoped and global-scoped rows
 * for this org. No rows at all -> 'normal' (no mode configured is legal).
 * A DB error -> 'unavailable', so the caller fails closed rather than
 * silently treating an unreadable table as 'normal'.
 */
export async function getActiveMode(
  client: SupabaseClient,
  organizationId: string,
): Promise<ModeLookup> {
  const { data, error } = await client
    .from("system_modes")
    .select("scope_type, scope_id, mode")
    .or(
      `and(scope_type.eq.client,scope_id.eq.${organizationId}),and(scope_type.eq.global,scope_id.is.null)`,
    );
  if (error || !data) {
    return "unavailable";
  }
  if (data.length === 0) {
    return "normal";
  }
  return data.reduce<SystemMode>(
    (strictest, row) => stricterOf(strictest, row.mode as SystemMode),
    "normal",
  );
}

export function evaluateKillSwitch(mode: ModeLookup, riskLevel: RiskLevel): KillSwitchDecision {
  if (mode === "unavailable") {
    if (FAIL_OPEN_FOR.has(riskLevel)) {
      return { mode, blocks: false };
    }
    return { mode, blocks: true, reason: "system_modes unreadable (fail closed)" };
  }
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
