// The ONLY gatekeeper for server paths that mutate production (our own host
// or a client's): repair-center repairs/auto-remediation, WordPress plugin
// updates over SSH, and staging-site provisioning over SSH. Each runs only
// when the org's (or global's) system mode is "normal"; if the mode cannot
// be read, this fails closed -- same contract as
// lib/command-plane/killSwitch.ts, which does the actual DB read.
//
// Callers (T16/T17):
//   - lib/repair-center/service.ts (startRepairFromIncident)
//   - lib/repair-center/remediations/engine.ts (tryRemediate)
//   - app/api/ops/repairs/health/route.ts (display probe, organizationId: null)
//   - app/api/ops/clients/[slug]/wp-update/route.ts (WP plugin updates)
//   - app/api/internal/hosting/provision-staging/route.ts (staging provisioning, incl. mode:"seed")
//
// Surfaces that only DISPLAY system_modes (repairs page banner, the
// command-plane /status and /*_mode handlers, GET /api/ops/system-modes) do
// NOT go through this gate -- they read system_modes directly.

import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateKillSwitch, getActiveMode } from "@/lib/command-plane/killSwitch";
import type { ModeLookup } from "@/lib/command-plane/types";

export async function checkProductionChangeAllowed(
  client: SupabaseClient | null,
  organizationId: string | null,
): Promise<{ allowed: boolean; mode: ModeLookup; reason?: string }> {
  if (!client) {
    return { allowed: false, mode: "unavailable", reason: "supabase_not_configured" };
  }
  const mode = await getActiveMode(client, organizationId);
  // Every gated path mutates production regardless of its own trigger's
  // severity -- always evaluated at "high". No separate mode-selection logic
  // belongs here; evaluateKillSwitch is the single source of truth for what
  // each mode blocks.
  const decision = evaluateKillSwitch(mode, "high");
  return { allowed: !decision.blocks, mode, reason: decision.reason };
}
