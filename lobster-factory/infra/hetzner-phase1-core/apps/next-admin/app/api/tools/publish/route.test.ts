// T18: action "create" writes the Woo product through bridgePost (gated there). A gate block must answer
// 423 with the mode; any other bridge failure stays 502. Every heavy dependency is a stub: only the
// create branch's response mapping is under test.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blockedChangeBody } from "@/lib/system-modes/blocked-change";

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

const printProviderMocks = vi.hoisted(() => ({
  createDraftOrderOnNative: vi.fn(),
  createSyncProductOnNative: vi.fn(),
  getCatalogVariants: vi.fn(),
  getSyncProduct: vi.fn(),
  isNativeStoreConfigured: vi.fn(),
  isPrintfulConfigured: vi.fn(),
  linkSyncVariant: vi.fn(),
  listSyncProducts: vi.fn(),
}));
vi.mock("../../../../lib/studio/print-provider", () => printProviderMocks);

const createWooProduct = vi.hoisted(() =>
  vi.fn(async (): Promise<{ ok: boolean; error?: string; blockedMode?: string; value?: unknown }> => ({
    ok: true,
    value: { product_id: 1, variation_ids: [] },
  })),
);
const bridgeBaseUrl = vi.hoisted(() => vi.fn((_clientId?: string): string | null => null));
const bridgeSiteOrg = vi.hoisted(() => vi.fn(async (): Promise<string | null | undefined> => null));
vi.mock("../../../../lib/studio/wp-bridge-client", () => ({
  createWooProduct,
  isBridgeConfigured: () => true,
  listBridgeClients: () => [],
  bridgeBaseUrl,
  bridgeSiteOrg,
}));

// T26 Part A: link/pfcreate/pforder each gate before their first Printful call.
const checkProductionChangeAllowed = vi.hoisted(() =>
  vi.fn(async (_c: unknown, _org: string | null | undefined): Promise<{ allowed: boolean; mode: string; reason?: string }> => ({
    allowed: true,
    mode: "normal",
  })),
);
vi.mock("../../../../lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed }));
vi.mock("../../../../lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({}) }));

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
  checkProductionChangeAllowed.mockClear();
  checkProductionChangeAllowed.mockResolvedValue({ allowed: true, mode: "normal" });
  bridgeBaseUrl.mockClear();
  bridgeBaseUrl.mockReturnValue(null);
  bridgeSiteOrg.mockClear();
  bridgeSiteOrg.mockResolvedValue(null);
  for (const m of Object.values(printProviderMocks)) m.mockReset();
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
    expect(await res.json()).toEqual(blockedChangeBody("emergency_stop"));
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

// ── T26 Part A: link / pfcreate / pforder each gate before their first Printful call ────────────────
const DESIGNS_BASE = "https://designs.example";
const post = (body: unknown) =>
  POST(new Request("http://localhost/api/tools/publish", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/tools/publish action=link -- system-mode gate", () => {
  const body = () => ({ action: "link", wooProductId: 123, printFileUrl: `${DESIGNS_BASE}/print.png` });

  beforeEach(() => {
    printProviderMocks.isPrintfulConfigured.mockReturnValue(true);
  });

  it("blocked: 423 with the mode, no Printful call", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop" });
    const res = await post(body());
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual(blockedChangeBody("emergency_stop"));
    expect(printProviderMocks.listSyncProducts).not.toHaveBeenCalled();
  });

  it("allowed: continues to the first Printful call", async () => {
    printProviderMocks.listSyncProducts.mockResolvedValue({ ok: false, error: "boom" });
    await post(body());
    expect(printProviderMocks.listSyncProducts).toHaveBeenCalledTimes(1);
  });

  it("no clientId concept on this legacy path -- gates on global mode (org null)", async () => {
    printProviderMocks.listSyncProducts.mockResolvedValue({ ok: false, error: "boom" });
    await post(body());
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(expect.anything(), null);
  });
});

describe("POST /api/tools/publish action=pfcreate -- system-mode gate", () => {
  const body = (extra?: Record<string, unknown>) => ({
    action: "pfcreate",
    wooProductId: 123,
    title: "Tee",
    printFileUrl: `${DESIGNS_BASE}/print.png`,
    retailPrice: "24.99",
    variantMap: [{ variationId: 1, color: "White", size: "M", sku: "SKU-1", price: "24.99" }],
    ...extra,
  });

  beforeEach(() => {
    printProviderMocks.isNativeStoreConfigured.mockReturnValue(true);
  });

  it("blocked: 423 with the mode, no Printful call", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "read_only" });
    const res = await post(body());
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual(blockedChangeBody("read_only"));
    expect(printProviderMocks.getCatalogVariants).not.toHaveBeenCalled();
  });

  it("allowed: continues to the first Printful call", async () => {
    printProviderMocks.getCatalogVariants.mockResolvedValue({ ok: false, error: "boom" });
    await post(body());
    expect(printProviderMocks.getCatalogVariants).toHaveBeenCalledTimes(1);
  });

  it("no clientId: resolves no bridge host -- gates on global mode", async () => {
    printProviderMocks.getCatalogVariants.mockResolvedValue({ ok: false, error: "boom" });
    await post(body());
    expect(bridgeBaseUrl).toHaveBeenCalledWith("");
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(expect.anything(), null);
  });

  it("clientId resolves a configured bridge site: gates on that site's org", async () => {
    const ORG_ID = "44444444-4444-4444-8444-444444444444";
    bridgeBaseUrl.mockImplementation((id?: string) => (id === "2" ? "https://two.example" : null));
    bridgeSiteOrg.mockResolvedValue(ORG_ID);
    printProviderMocks.getCatalogVariants.mockResolvedValue({ ok: false, error: "boom" });
    await post(body({ clientId: "2" }));
    expect(bridgeSiteOrg).toHaveBeenCalledWith(expect.anything(), "https://two.example");
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(expect.anything(), ORG_ID);
  });

  it("clientId's bridge org unresolvable (ambiguous wp_sites rows): blocked unavailable, no gate guess", async () => {
    bridgeBaseUrl.mockReturnValue("https://two.example");
    bridgeSiteOrg.mockResolvedValue(undefined);
    const res = await post(body({ clientId: "2" }));
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual(blockedChangeBody("unavailable"));
    expect(checkProductionChangeAllowed).not.toHaveBeenCalled();
    expect(printProviderMocks.getCatalogVariants).not.toHaveBeenCalled();
  });
});

describe("POST /api/tools/publish action=pforder -- system-mode gate", () => {
  const body = () => ({
    action: "pforder",
    wooOrderId: 555,
    recipient: { name: "A B", address1: "1 St", city: "Taipei", country_code: "TW", zip: "100" },
    items: [{ sku: "SKU-1", quantity: 1 }],
  });

  beforeEach(() => {
    printProviderMocks.isNativeStoreConfigured.mockReturnValue(true);
  });

  it("blocked: 423 with the mode, no Printful call", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "maintenance" });
    const res = await post(body());
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual(blockedChangeBody("maintenance"));
    expect(printProviderMocks.createDraftOrderOnNative).not.toHaveBeenCalled();
  });

  it("allowed: continues to the first Printful call", async () => {
    printProviderMocks.createDraftOrderOnNative.mockResolvedValue({ ok: false, error: "boom" });
    await post(body());
    expect(printProviderMocks.createDraftOrderOnNative).toHaveBeenCalledTimes(1);
  });

  it("no clientId on this operator one-off path -- gates on global mode", async () => {
    printProviderMocks.createDraftOrderOnNative.mockResolvedValue({ ok: false, error: "boom" });
    await post(body());
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(expect.anything(), null);
  });
});
