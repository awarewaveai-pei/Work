import type { StagingHostingProvisionResult } from "./types";

/**
 * `LOBSTER_HOSTING_ADAPTER=provider_stub` — validates env for a future HTTP provider.
 * Phase 1 does not call vendor APIs; returns `blocked` with a clear message once env exists,
 * or lists missing variables.
 */
export function evaluateProviderStub(): StagingHostingProvisionResult {
  const baseUrl = process.env.LOBSTER_HOSTING_PROVIDER_BASE_URL?.trim();
  const token = process.env.LOBSTER_HOSTING_API_TOKEN?.trim();
  const missing: string[] = [];
  if (!baseUrl) missing.push("LOBSTER_HOSTING_PROVIDER_BASE_URL");
  if (!token) missing.push("LOBSTER_HOSTING_API_TOKEN");

  if (missing.length > 0) {
    return {
      outcome: "blocked",
      adapter: "provider_stub",
      message:
        "provider_stub adapter selected but required secrets/base URL are missing. Set env vars or switch to LOBSTER_HOSTING_ADAPTER=mock.",
      missingEnv: missing,
    };
  }

  return {
    outcome: "blocked",
    adapter: "provider_stub",
    message:
      "provider_stub is a gate only. For real HTTP provisioning use LOBSTER_HOSTING_ADAPTER=http_json (see docs/hosting/HTTP_JSON_HOSTING_ADAPTER.md) or LOBSTER_HOSTING_ADAPTER=mock.",
    missingEnv: [],
  };
}
