import { createHash } from "node:crypto";
import type { MockStagingSiteRef } from "./types";

/**
 * Deterministic UUID-shaped id from siteId (no DB); stable across reruns for the same site.
 */
export function deterministicMockEnvironmentId(siteId: string): string {
  const h = createHash("sha256")
    .update(`lobster:mock-staging-env:${siteId}`)
    .digest("hex");
  const seg = (start: number, len: number) => h.slice(start, start + len);
  return `${seg(0, 8)}-${seg(8, 4)}-4${seg(12, 3)}-a${seg(15, 3)}-${seg(16, 12)}`;
}

function slugifySiteName(siteName: string): string {
  const s = siteName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "site";
}

/**
 * Pure mock ref (no env). Use via `resolveStagingProvisioning` when adapter=mock.
 */
export function buildMockStagingSiteRef(input: {
  siteId: string;
  siteName: string;
  organizationId: string;
}): MockStagingSiteRef {
  const environmentId = deterministicMockEnvironmentId(input.siteId);
  const slug = slugifySiteName(input.siteName);

  return {
    adapter: "mock",
    environmentId,
    wpRootPath: `/var/www/html/mock-staging/${input.siteId}/${slug}`,
    stagingSiteUrl: `https://mock-staging.invalid/sites/${input.siteId}/${slug}`,
    wpAdminUrl: `https://mock-staging.invalid/sites/${input.siteId}/${slug}/wp-admin/`,
    provisioningNotes: [
      "LOBSTER_HOSTING_ADAPTER=mock: no real compute, DNS, or TLS was provisioned.",
      "Bind wpRootPath to a local WordPress tree when exercising apply-manifest on a workstation.",
    ],
  };
}
