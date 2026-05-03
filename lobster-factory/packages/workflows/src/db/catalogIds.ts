/**
 * Deterministic catalog IDs (must match SQL seeds in packages/db/migrations/0006_seed_catalog.sql).
 *
 * These IDs allow workflow_runs/package_install_runs to reference known workflow_versions/manifests
 * without having to query the catalog first.
 */
export const LobsterCatalogIds = {
  wcCore: {
    packageVersionId: "9819a867-36b9-4470-bdb9-611a0751dba6",
    manifestId: "8760d0ba-35ae-483a-8fa6-abd19f5c6d4d",
  },
  wpBasic: {
    packageVersionId: "a1b2c3d4-0001-4000-8000-000000000001",
    manifestId: "a1b2c3d4-0002-4000-8000-000000000002",
  },
  wpBusiness: {
    packageVersionId: "a1b2c3d4-0003-4000-8000-000000000003",
    manifestId: "a1b2c3d4-0004-4000-8000-000000000004",
  },
  workflows: {
    createWpSiteWorkflowVersionId: "d6d3cfe2-5aba-4458-84a6-37237d6df347",
    applyManifestWorkflowVersionId: "0161fdd2-2381-4ab5-bcf9-fe247507ac05",
    adoptClientOsWorkflowVersionId: "b2c3d4e5-0001-4000-8000-000000000001",
    aoInfraCheckWorkflowVersionId:  "b2c3d4e5-0002-4000-8000-000000000002",
  },
} as const;

export type ManifestSlug = "wp-basic" | "wp-business" | "wc-core";

export function catalogIdsForManifest(slug: ManifestSlug) {
  switch (slug) {
    case "wp-basic":    return LobsterCatalogIds.wpBasic;
    case "wp-business": return LobsterCatalogIds.wpBusiness;
    case "wc-core":     return LobsterCatalogIds.wcCore;
  }
}

