/**
 * Selects + constructs the server-provisioning adapter from env. Keeps `provisionClient`
 * pure (deps injected) — this factory is the one place that reads the environment.
 */

import type { ServerProvisionAdapter } from "../hosting/providers/serverProvisionContract";
import type { ServerProvisionResult } from "../hosting/serverTypes";
import { createMockServerAdapter } from "../hosting/mockServerAdapter";
import { createHetznerAdapter } from "../hosting/providers/hetzner/HetznerHostingAdapter";
import { createVaultSecretStore, type PutSecret } from "../hosting/providers/hetzner/secretStore";
import { isBillableProvisionEnabled } from "../hosting/resolveServerProvisioning";

/** Client tier → Hetzner server type (D6). SIN = AMD cpx only (cx deprecated 2026-01-01). */
export const TIER_SERVER_TYPE: Record<string, string> = {
  starter: "cpx11",
  business: "cpx21",
  commerce: "cpx31",
  premium: "cpx41",
};

export function serverTypeForTier(tier: string): string {
  return TIER_SERVER_TYPE[tier] ?? "cpx21";
}

/** An adapter that always blocks — used when a mode is selected but its prerequisites are missing. */
function blockedAdapter(message: string, missingEnv: string[] = []): ServerProvisionAdapter {
  return {
    id: "blocked",
    async provisionServer(): Promise<ServerProvisionResult> {
      return { outcome: "blocked", adapter: "hetzner_cloud", message, missingEnv };
    },
  };
}

/** An adapter that's idle — used for LOBSTER_SERVER_ADAPTER=none/unset. */
function idleAdapter(): ServerProvisionAdapter {
  return { id: "none", async provisionServer(): Promise<ServerProvisionResult> { return { outcome: "idle" }; } };
}

export type BuildAdapterOptions = {
  region: string;
  /** Inject a persistence sink for the per-tenant SSH key (vault / worker — Phase 4). */
  putSecret?: PutSecret;
  /** Hetzner Cloud Firewall ids (managed by OpenTofu) to attach. */
  firewallIds?: number[];
  fetchImpl?: typeof fetch;
};

/**
 * Build the adapter named by `LOBSTER_SERVER_ADAPTER`:
 *  - none/unset → idle adapter
 *  - mock       → deterministic mock (no API, no money)
 *  - hetzner_cloud → real adapter (blocks if HETZNER_STAGING_TOKEN missing). Billable only
 *    when LOBSTER_SERVER_PROVISION_ENABLED is also on; otherwise it dry-runs.
 */
export function buildServerAdapterFromEnv(opts: BuildAdapterOptions): ServerProvisionAdapter {
  const mode = (process.env.LOBSTER_SERVER_ADAPTER || "none").trim().toLowerCase();

  if (mode === "none") return idleAdapter();
  if (mode === "mock") return createMockServerAdapter();

  if (mode === "hetzner_cloud") {
    const apiToken = process.env.HETZNER_STAGING_TOKEN || "";
    if (!apiToken) {
      return blockedAdapter(
        "LOBSTER_SERVER_ADAPTER=hetzner_cloud but HETZNER_STAGING_TOKEN is empty (see PLAN Phase 4 prerequisites).",
        ["HETZNER_STAGING_TOKEN"]
      );
    }
    return createHetznerAdapter({
      apiToken,
      region: opts.region,
      billable: isBillableProvisionEnabled(),
      secretStore: createVaultSecretStore(opts.putSecret),
      firewallIds: opts.firewallIds,
      fetchImpl: opts.fetchImpl,
    });
  }

  return blockedAdapter(`Unknown LOBSTER_SERVER_ADAPTER="${mode}". Use none | mock | hetzner_cloud.`);
}
