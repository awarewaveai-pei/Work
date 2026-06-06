import type { ServerProvisionResult } from "../serverTypes";

/**
 * Input every server-provisioning adapter receives. Trust-boundary fields
 * (region / serverType / image) must already be validated by the caller's Zod
 * schema before reaching an adapter — adapters do not re-validate shape, they act.
 */
export type ServerProvisionInput = {
  siteId: string;
  siteName: string;
  organizationId: string;
  /** Hetzner location, e.g. "sin". Client delivery sites default to Singapore. */
  region: string;
  /** Whitelisted server type, e.g. "cpx21" (AMD; cx-series deprecated 2026-01-01). */
  serverType: string;
  /** OS image, e.g. "ubuntu-24.04". */
  image: string;
};

/**
 * Contract for a real server-provisioning vendor module (`providers/<vendor>/...`).
 * Wired into `resolveServerProvisioning` when its adapter mode is enabled.
 *
 * Implementations MUST:
 *  - be idempotent (C2): query by site label first; return `{outcome:"reused"}` on hit.
 *  - never inherit/leak secrets (M7) and never place a credential value in a ref.
 *  - compensate on mid-provision failure (M9): destroy the half-built server +
 *    its Primary IP, return `{outcome:"rolled_back"}` — never strand an orphan.
 *  - honour the dry-run gate: when provisioning is disabled, return
 *    `{outcome:"dry_run"}` WITHOUT any billable API call.
 */
export type ServerProvisionAdapter = {
  readonly id: string;
  provisionServer(input: ServerProvisionInput): Promise<ServerProvisionResult>;
};
