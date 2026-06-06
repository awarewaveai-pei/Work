import { buildMockServerRef } from "./mockServerAdapter";
import type { ServerProvisionInput } from "./providers/serverProvisionContract";
import type { ServerProvisionResult } from "./serverTypes";

const KNOWN = new Set(["none", "mock", "hetzner_cloud"]);

/**
 * Single entry for machine-layer (server) provisioning. Mirrors the env-gate shape of
 * `resolveStagingProvisioning` so both layers read the same way.
 *
 * Two gates (defence in depth — a real Hetzner server costs money + is irreversible):
 *  - `LOBSTER_SERVER_ADAPTER` (default `none`): which adapter — none | mock | hetzner_cloud.
 *  - `LOBSTER_SERVER_PROVISION_ENABLED` (default OFF): only `true` permits a BILLABLE
 *    create. When OFF, `hetzner_cloud` resolves to a `dry_run` (validated + rendered,
 *    no API call). `mock` never touches an API, so it ignores this gate.
 *
 * `hetzner_cloud` is wired to its provider in a later increment; until then it returns
 * `blocked` (same honest pattern as the legacy `provider_stub` staging adapter).
 */
export async function resolveServerProvisioning(
  input: ServerProvisionInput
): Promise<ServerProvisionResult> {
  const raw = process.env.LOBSTER_SERVER_ADAPTER?.trim();
  const mode = (raw || "none").toLowerCase();

  if (!KNOWN.has(mode)) {
    return {
      outcome: "blocked",
      adapter: mode,
      message: `Unknown LOBSTER_SERVER_ADAPTER="${raw}". Use none | mock | hetzner_cloud.`,
      missingEnv: [],
    };
  }

  if (mode === "none") {
    return { outcome: "idle" };
  }

  if (mode === "mock") {
    return { outcome: "mock", ref: buildMockServerRef(input) };
  }

  // mode === "hetzner_cloud" — provider not yet wired (lands in a follow-up increment).
  // See lobster-factory/docs/hosting/HETZNER_HOSTING_LAYER_PLAN.md §D3.
  return {
    outcome: "blocked",
    adapter: "hetzner_cloud",
    message:
      "hetzner_cloud server adapter is not implemented yet. " +
      "Use LOBSTER_SERVER_ADAPTER=mock for dry-running the chain, or wire the Hetzner provider per PLAN §D3.",
    missingEnv: [],
  };
}

/** True when a real billable provision is permitted (both gates on). */
export function isBillableProvisionEnabled(): boolean {
  const v = (process.env.LOBSTER_SERVER_PROVISION_ENABLED || "").toLowerCase();
  return v === "true" || v === "1";
}
