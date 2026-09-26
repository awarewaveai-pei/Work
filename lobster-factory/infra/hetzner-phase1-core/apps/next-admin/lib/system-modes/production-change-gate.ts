// The ONLY gate for any server path that changes production: our own host (SSH / WP-CLI), a
// client's WordPress site (REST writes, the WP Bridge plugin), outbound publishing (social,
// newsletter), or external-resource provisioning (GitHub/PostHog/n8n, Hetzner). Each runs only
// when the org's (or global's) system mode is "normal"; an unreadable mode fails closed -- same
// contract as lib/command-plane/killSwitch.ts, which does the DB read.
//
// Gated:
//   - lib/repair-center/service.ts (startRepairFromIncident), lib/repair-center/remediations/
//     engine.ts (tryRemediate) -- org from the incident (T16)
//   - app/api/ops/clients/[slug]/wp-update/route.ts -- org from the client row (T17)
//   - app/api/internal/hosting/provision-staging/route.ts (provision and seed) -- org from the
//     request body, uuid-validated (T17)
//   - lib/content/publish/wordpress-core.ts (publishToWordPress, both the /api/content/publish
//     route and the in-process `publish/wordpress` block) -- org from the resolved WpSite
//   - app/api/content/wp-post/route.ts (PATCH, DELETE) -- org from the resolved WpSite
//   - app/api/video/embed-to-wp/route.ts -- org from the resolved WpSite
//   - app/api/content/social-publish/route.ts -- org = the already-org-access-checked clientId
//   - app/api/content/syndicate/route.ts -- no org param on this route (drafts copy, no
//     per-client target) -- org null, global mode only
//   - lib/studio/wp-bridge-client.ts (bridgePost, the one non-GET dispatch function every bridge
//     write goes through: createWooProduct/createPost/createNewsletter, and any future caller) --
//     org null (the bridge site is env-configured, never tied to an organizations row)
//   - app/api/build/provision-services/route.ts -- org from the validated request body
//   - app/api/provision/route.ts (hetzner_cloud dispatch branch only -- "none"/"mock" never call
//     out) -- org from the validated request body
//
// app/api/ops/repairs/health/route.ts only reads the mode through it for display.
// A structural test (lib/system-modes/__tests__/production-change-coverage.test.ts) fails the
// build if a new SSH-, WP-Bridge-, or WordPress-REST-writing path is added without this gate (or
// a justified allowlist entry).

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
