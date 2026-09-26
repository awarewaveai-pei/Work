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
//   - build/runs (caller-supplied organizationId, checked before org resolution/creation)
//   - the workflows package (lobster-factory/packages/workflows) re-checks at dispatch time via its
//     own src/lib/systemMode.ts, which mirrors this module's semantics exactly (kept in lockstep by
//     a shared fixture -- see lib/system-modes/__tests__/system-mode-fixture-parity.test.ts and
//     packages/workflows/src/lib/systemMode.test.ts). It cannot import next-admin code at runtime,
//     so it is a deliberate parallel implementation, not a wrapper around this function.
//     dispatch-action-run.ts's dispatchRun gates each run's org right before triggering (a run
//     queued while normal must not execute after the mode flips); orchestrate-tenant-provisioning
//     gates at the start, before any provider call.
// Not gated yet (agency-os/TASKS.md, T18 follow-ups): Printful and Chatwoot writes.
// repairs/health only reads the mode for display.
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
