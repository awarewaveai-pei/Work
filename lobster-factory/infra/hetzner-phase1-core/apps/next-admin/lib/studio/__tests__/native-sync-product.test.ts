import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSyncProductOnNative } from "../print-provider";

// Mocks the @external_id idempotency pre-check. createSyncProductOnNative resolves an existing
// product from its first (and only) fetch when the Woo product was already published, so we can
// assert the faithfulness flags without a POST.
function mockExistingProduct(skus: string[]) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      code: 200,
      result: {
        sync_product: { id: 999, external_id: "7164", name: "Tee" },
        sync_variants: skus.map((sku, i) => ({ id: 1000 + i, external_id: sku, variant_id: 4025 + i })),
      },
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const inputVariants = (skus: string[]) =>
  skus.map((sku, i) => ({ externalId: sku, catalogVariantId: 4025 + i, retailPrice: "25.00", printFileUrl: "https://x/p.png" }));

describe("createSyncProductOnNative — idempotent hit faithfulness", () => {
  beforeEach(() => {
    process.env.PRINTFUL_API_KEY = "test-token";
    process.env.PRINTFUL_NATIVE_STORE_ID = "18324409";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("clean idempotent hit: same SKUs → incompleteVariants false (no POST, reuses existing)", async () => {
    const fetchMock = mockExistingProduct(["SKU-A", "SKU-B"]);
    const r = await createSyncProductOnNative({
      name: "Tee",
      externalId: "7164",
      variants: inputVariants(["SKU-A", "SKU-B"]),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.alreadyExisted).toBe(true);
      expect(r.value.incompleteVariants).toBe(false);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1); // pre-check only, never POST
  });

  it("renamed-reseed: same count but a SKU not bound on the existing product → incompleteVariants true", async () => {
    // Existing product (first publish) carries SKU-A/SKU-B; a rename reseeds SKU-A/SKU-C.
    // Count matches (2 == 2) — count-only comparison would falsely report a faithful match.
    mockExistingProduct(["SKU-A", "SKU-B"]);
    const r = await createSyncProductOnNative({
      name: "Tee (renamed)",
      externalId: "7164",
      variants: inputVariants(["SKU-A", "SKU-C"]),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.incompleteVariants).toBe(true); // → route returns 422 native_product_incomplete
  });
});
