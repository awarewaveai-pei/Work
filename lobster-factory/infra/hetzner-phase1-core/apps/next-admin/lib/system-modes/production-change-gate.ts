// The system-mode gate for server paths that change production at the HOST level (SSH / WP-CLI):
// each runs only when the org's (or global's) system mode is "normal"; an unreadable mode fails
// closed -- same contract as lib/command-plane/killSwitch.ts, which does the DB read.
// Gated: lib/repair-center/service.ts (startRepairFromIncident), lib/repair-center/remediations/
// engine.ts (tryRemediate), app/api/ops/clients/[slug]/wp-update/route.ts, app/api/internal/hosting/
// provision-staging/route.ts (provision and seed). app/api/ops/repairs/health/route.ts only reads the
// mode through it for display.
// NOT yet gated (TASKS 2026-09-25): content writes to client sites (content/wp-post, content/publish,
// video/embed-to-wp, lib/studio/wp-bridge-client.ts callers) and tenant-provisioning dispatch
// (build/provision-services). Display-only readers of system_modes do not use this gate.

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
