// The ONLY gatekeeper for repair-center paths that mutate production
// (startRepairFromIncident, tryRemediate). Repairs and auto-remediation run
// only when the org's (or global's) system mode is "normal"; if the mode
// cannot be read, this fails closed -- same contract as
// lib/command-plane/killSwitch.ts, which does the actual DB read.
//
// Surfaces that only DISPLAY system_modes (repairs page banner, the
// command-plane /status and /*_mode handlers, GET /api/ops/system-modes) do
// NOT go through this gate -- they read system_modes directly.

import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateKillSwitch, getActiveMode } from "@/lib/command-plane/killSwitch";
import type { ModeLookup } from "@/lib/command-plane/types";

export async function checkRepairAllowed(
  client: SupabaseClient | null,
  organizationId: string | null,
): Promise<{ allowed: boolean; mode: ModeLookup; reason?: string }> {
  if (!client) {
    return { allowed: false, mode: "unavailable", reason: "supabase_not_configured" };
  }
  const mode = await getActiveMode(client, organizationId);
  // Repairs and auto-remediation both mutate production regardless of the
  // triggering incident's own severity -- always evaluated at "high". No
  // separate mode-selection logic belongs here; evaluateKillSwitch is the
  // single source of truth for what each mode blocks.
  const decision = evaluateKillSwitch(mode, "high");
  return { allowed: !decision.blocks, mode, reason: decision.reason };
}
