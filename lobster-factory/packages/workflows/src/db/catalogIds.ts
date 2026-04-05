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
  workflows: {
    createWpSiteWorkflowVersionId: "d6d3cfe2-5aba-4458-84a6-37237d6df347",
    applyManifestWorkflowVersionId: "0161fdd2-2381-4ab5-bcf9-fe247507ac05",
  },
} as const;

