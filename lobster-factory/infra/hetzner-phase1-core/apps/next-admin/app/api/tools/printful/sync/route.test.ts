// T26 Part A: PUT (linkSyncVariant, a real write) gates before its Printful call. GET only reads
// (listSyncProducts/getSyncProduct/getCatalogVariants) and is unchanged -- no gate, no test needed here.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blockedChangeBody } from "@/lib/system-modes/blocked-change";

vi.mock("../../../../../lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "owner" }), canCreateAiImageJob: () => true }));
vi.mock("../../../../../lib/storage/r2", () => ({ getDesignsPublicBase: () => "https://designs.example" }));

const printProviderMocks = vi.hoisted(() => ({
  getCatalogVariants: vi.fn(),
  getSyncProduct: vi.fn(),
  isPrintfulConfigured: vi.fn(() => true),
  linkSyncVariant: vi.fn(),
  listSyncProducts: vi.fn(),
}));
vi.mock("../../../../../lib/studio/print-provider", () => printProviderMocks);

const checkProductionChangeAllowed = vi.hoisted(() =>
  vi.fn(async (_c: unknown, _org: string | null): Promise<{ allowed: boolean; mode: string; reason?: string }> => ({
    allowed: true,
    mode: "normal",
  })),
);
vi.mock("../../../../../lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed }));
vi.mock("../../../../../lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({}) }));

const { PUT } = await import("./route");

const body = () => ({ syncVariantId: 1, catalogVariantId: 2, printFileUrl: "https://designs.example/print.png" });
const put = (b: unknown) => PUT(new Request("http://localhost/api/tools/printful/sync", { method: "PUT", body: JSON.stringify(b) }));

const savedFlag = process.env.POD_DESIGNS_ENABLED;
beforeEach(() => {
  process.env.POD_DESIGNS_ENABLED = "true";
  checkProductionChangeAllowed.mockClear();
  checkProductionChangeAllowed.mockResolvedValue({ allowed: true, mode: "normal" });
  for (const m of Object.values(printProviderMocks)) m.mockClear();
  printProviderMocks.isPrintfulConfigured.mockReturnValue(true);
});
afterEach(() => {
  if (savedFlag === undefined) delete process.env.POD_DESIGNS_ENABLED;
  else process.env.POD_DESIGNS_ENABLED = savedFlag;
});

describe("PUT /api/tools/printful/sync -- system-mode gate", () => {
  it("blocked: 423 with the mode, no Printful call", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop" });
    const res = await put(body());
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual(blockedChangeBody("emergency_stop"));
    expect(printProviderMocks.linkSyncVariant).not.toHaveBeenCalled();
  });

  it("allowed: continues to the Printful call", async () => {
    printProviderMocks.linkSyncVariant.mockResolvedValue({ ok: true, value: { id: 1 } });
    const res = await put(body());
    expect(res.status).toBe(200);
    expect(printProviderMocks.linkSyncVariant).toHaveBeenCalledTimes(1);
  });

  it("no per-client selector on this route -- gates on global mode (org null)", async () => {
    printProviderMocks.linkSyncVariant.mockResolvedValue({ ok: true, value: { id: 1 } });
    await put(body());
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(expect.anything(), null);
  });

  it("invalid body: 400 before the gate is even asked", async () => {
    checkProductionChangeAllowed.mockClear();
    const res = await put({ syncVariantId: -1 });
    expect(res.status).toBe(400);
    expect(checkProductionChangeAllowed).not.toHaveBeenCalled();
  });
});
