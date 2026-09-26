// The one gate for server paths that change production: a gated path runs only while the org's (and
// global's) system mode is "normal"; an unreadable mode fails closed -- same contract as
// lib/command-plane/killSwitch.ts, which does the DB read. Blocked callers answer the 423 built by
// lib/system-modes/blocked-change.ts.
//
// Gated (org in parentheses):
//   - repair-center service.ts startRepairFromIncident, remediations/engine.ts tryRemediate (incident)
//   - ops/clients/[slug]/wp-update (client row); internal/hosting/provision-staging (body / spec)
//   - lib/content/publish/wordpress-core.ts publishToWordPress (resolved WpSite)
//   - content/wp-post PATCH+DELETE, video/embed-to-wp (resolved WpSite)
//   - content/social-publish (lib/content/social-org.ts: the site's org, or the given org id)
//   - lib/studio/wp-bridge-client.ts bridgePost -- every bridge write (wp_sites row on the bridge host)
//   - build/provision-services, provision (hetzner_cloud dispatch only) (validated body)
// Not gated yet (agency-os/TASKS.md, T18 follow-ups): build/runs + the workflows dispatcher, Printful
// and Chatwoot writes. repairs/health only reads the mode for display.
// lib/system-modes/__tests__/production-change-coverage.test.ts fails the build when a new SSH / WP
// Bridge / WordPress-REST-writing file lacks this call or a justified allowlist entry.

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
