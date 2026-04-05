import { buildMockStagingSiteRef } from "./mockStagingAdapter";
import { provisionHttpJsonStaging } from "./providers/httpJsonStagingAdapter";
import { evaluateProviderStub } from "./providerStubAdapter";
import type { StagingHostingProvisionResult } from "./types";

const KNOWN = new Set(["none", "mock", "provider_stub", "http_json"]);

/**
 * Single entry for staging hosting selection (create-wp-site).
 * - `none` (default): no synthetic provisioning; orchestration stays at TODO placeholders.
 * - `mock`: deterministic fake staging ref.
 * - `provider_stub`: env gate + explicit "not implemented" until vendor module lands.
 * - `http_json`: POST to vendor HTTP API (see docs/hosting/HTTP_JSON_HOSTING_ADAPTER.md).
 */
export async function resolveStagingProvisioning(input: {
  siteId: string;
  siteName: string;
  organizationId: string;
}): Promise<StagingHostingProvisionResult> {
  const raw = process.env.LOBSTER_HOSTING_ADAPTER?.trim();
  const mode = (raw || "none").toLowerCase();

  if (!KNOWN.has(mode)) {
    return {
      outcome: "blocked",
      adapter: mode,
      message: `Unknown LOBSTER_HOSTING_ADAPTER="${raw}". Use none | mock | provider_stub | http_json.`,
      missingEnv: [],
    };
  }

  if (mode === "mock") {
    return { outcome: "mock", ref: buildMockStagingSiteRef(input) };
  }

  if (mode === "provider_stub") {
    return evaluateProviderStub();
  }

  if (mode === "http_json") {
    return provisionHttpJsonStaging(input);
  }

  return { outcome: "idle" };
}
