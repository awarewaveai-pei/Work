/**
 * Deterministic catalog IDs — must match SQL seeds:
 * - `0006_seed_catalog.sql` (wc-core baseline)
 * - `0023_dispatcher_enum_and_catalog_seeds.sql` (wp-basic, wp-business, adopt-client-os, ao-infrastructure-check)
 * - `wc-custom` is reserved in code but still awaits a matching catalog migration before
 *   LOBSTER_ENABLE_DB_WRITES=true.
 *
 * `wp-tourism` is a valid staging manifest, but it has no seeded package/version/manifest
 * rows in the current database migrations. `catalogIdsForManifest` therefore returns null
 * for it so callers can keep shell-only staging available while refusing DB writes.
 *
 * These IDs allow workflow_runs/package_install_runs to reference known workflow_versions/manifests
 * without having to query the catalog first.
 */
export const LobsterCatalogIds = {
  wcCore: {
    packageVersionId: "9819a867-36b9-4470-bdb9-611a0751dba6",
    manifestId: "8760d0ba-35ae-483a-8fa6-abd19f5c6d4d",
  },
  wcCustom: {
    packageVersionId: "a1b2c3d4-0005-4000-8000-000000000005",
    manifestId: "a1b2c3d4-0006-4000-8000-000000000006",
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

export type ManifestSlug = "wp-basic" | "wp-business" | "wp-tourism" | "wc-core" | "wc-custom";

export function catalogIdsForManifest(slug: ManifestSlug) {
  switch (slug) {
    case "wp-basic":    return LobsterCatalogIds.wpBasic;
    case "wp-business": return LobsterCatalogIds.wpBusiness;
    case "wp-tourism":  return null;
    case "wc-core":     return LobsterCatalogIds.wcCore;
    case "wc-custom":   return null;
    default: {
      const exhaustiveCheck: never = slug;
      throw new Error(`catalogIdsForManifest: unhandled manifest slug "${exhaustiveCheck}"`);
    }
  }
}

