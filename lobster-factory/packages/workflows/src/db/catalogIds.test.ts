import { describe, expect, it } from "vitest";
import { LobsterCatalogIds, catalogIdsForManifest } from "./catalogIds";

describe("catalogIdsForManifest", () => {
  it("resolves manifests that have seeded DB catalog rows", () => {
    expect(catalogIdsForManifest("wp-basic")).toEqual(LobsterCatalogIds.wpBasic);
    expect(catalogIdsForManifest("wp-business")).toEqual(LobsterCatalogIds.wpBusiness);
    expect(catalogIdsForManifest("wc-core")).toEqual(LobsterCatalogIds.wcCore);
  });

  it("returns no DB catalog for manifests without seeded rows", () => {
    expect(catalogIdsForManifest("wp-tourism")).toBeNull();
    expect(catalogIdsForManifest("wc-custom")).toBeNull();
  });
});
