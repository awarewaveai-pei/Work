// T18: action "create" writes the Woo product through bridgePost (gated there). A gate block must answer
// 423 with the mode; any other bridge failure stays 502. Every heavy dependency is a stub: only the
// create branch's response mapping is under test.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "owner" }), canCreateAiImageJob: () => true }));
vi.mock("../../../../lib/storage/r2", () => ({
  buildDesignKey: vi.fn(),
  getDesignsPublicBase: () => "https://designs.example",
  isDesignsAsset: () => false,
  putDesignObject: vi.fn(),
}));
vi.mock("../../../../lib/studio/upscaler", () => ({ upscaleToPrintFile: vi.fn() }));
vi.mock("../../../../lib/studio/print-file", () => ({ buildFaithfulPrintFile: vi.fn() }));
vi.mock("../../../../lib/studio/to-product-image", () => ({ toProductImage: vi.fn() }));
vi.mock("../../../../lib/studio/wp-web-image", () => ({ normalizeManyForWp: async () => new Map() }));
vi.mock("../../../../lib/studio/flatlay", () => ({ composeFlatlay: vi.fn(), parseHexColor: vi.fn() }));
vi.mock("../../../../lib/studio/product-copy", () => ({ generateProductCopy: vi.fn() }));
vi.mock("../../../../lib/studio/pod-product", () => ({
  buildPodProductPayload: () => ({}),
  buildVariantPlan: () => [],
  priceForSize: vi.fn(),
}));
vi.mock("../../../../lib/studio/pod-catalog-config", () => ({ podModelById: () => undefined }));
vi.mock("../../../../lib/studio/printful-catalog", () => ({ fetchProductTierPricing: vi.fn(), fetchProductSizeGuide: vi.fn() }));
vi.mock("../../../../lib/studio/print-provider", () => ({
  createDraftOrderOnNative: vi.fn(),
  createSyncProductOnNative: vi.fn(),
  getCatalogVariants: vi.fn(),
  getSyncProduct: vi.fn(),
  isNativeStoreConfigured: vi.fn(),
  isPrintfulConfigured: vi.fn(),
  linkSyncVariant: vi.fn(),
  listSyncProducts: vi.fn(),
}));

const createWooProduct = vi.hoisted(() =>
  vi.fn(async (): Promise<{ ok: boolean; error?: string; blockedMode?: string; value?: unknown }> => ({
    ok: true,
    value: { product_id: 1, variation_ids: [] },
  })),
);
vi.mock("../../../../lib/studio/wp-bridge-client", () => ({
  BRIDGE_BLOCKED_ERROR: "system_mode_blocks_change",
  createWooProduct,
  isBridgeConfigured: () => true,
  listBridgeClients: () => [],
}));

const { POST } = await import("./route");

const create = () =>
  POST(
    new Request("http://localhost/api/tools/publish", {
      method: "POST",
      body: JSON.stringify({ action: "create", title: "Tee one", retailPrice: "24.99" }),
    }),
  );

const savedFlag = process.env.POD_DESIGNS_ENABLED;
beforeEach(() => {
  process.env.POD_DESIGNS_ENABLED = "true";
  createWooProduct.mockClear();
});
afterEach(() => {
  if (savedFlag === undefined) delete process.env.POD_DESIGNS_ENABLED;
  else process.env.POD_DESIGNS_ENABLED = savedFlag;
});

describe("POST /api/tools/publish action=create -- bridge gate result", () => {
  it("bridge blocked by the system mode: 423 with the mode", async () => {
    createWooProduct.mockResolvedValueOnce({ ok: false, error: "system_mode_blocks_change", blockedMode: "emergency_stop" });
    const res = await create();
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ error: "system_mode_blocks_change", mode: "emergency_stop" });
  });

  it("other bridge failure: 502", async () => {
    createWooProduct.mockResolvedValueOnce({ ok: false, error: "woocommerce_not_active" });
    const res = await create();
    expect(res.status).toBe(502);
  });

  it("allowed: 200 and the product write happened", async () => {
    expect((await create()).status).toBe(200);
    expect(createWooProduct).toHaveBeenCalledTimes(1);
  });
});
