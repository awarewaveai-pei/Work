import { afterEach, describe, expect, it, vi } from "vitest";

const meta = vi.hoisted(() => ({
  assertMetaAdsBrand: vi.fn(),
  getMetaInsights: vi.fn(),
  listMetaAdAccounts: vi.fn(),
  listMetaCampaigns: vi.fn(),
  setMetaCampaignStatus: vi.fn(),
  MetaAdsError: class MetaAdsError extends Error { constructor(readonly status: number, message: string, readonly code: string) { super(message); } },
}));
vi.mock("@/lib/entitlements/grant", () => ({ withFeature: (_key: string, handler: (req: Request) => Promise<Response>) => handler }));
vi.mock("@/lib/social/authz", () => ({ ANY_ROLE: ["owner"], WRITE_ROLES: ["owner"], requireBrandRole: vi.fn(), BrandAccessError: class BrandAccessError extends Error {}, }));
vi.mock("@/lib/social/meta-ads", () => meta);

import { GET, PATCH } from "./route";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const saved = { ...process.env };

afterEach(() => { process.env = { ...saved }; vi.clearAllMocks(); });

describe("/api/social/ads", () => {
  it("refuses a cross-brand account before a campaign Meta call", async () => {
    meta.assertMetaAdsBrand.mockRejectedValue(new meta.MetaAdsError(403, "wrong brand", "meta_ads_brand_mismatch"));
    const response = await GET(new Request(`https://example.test/api/social/ads?brand=${A}&view=campaigns&account=act_456`));
    expect(response.status).toBe(403);
    expect(meta.listMetaCampaigns).not.toHaveBeenCalled();
  });

  it("keeps ads writes off until the explicit switch is true", async () => {
    delete process.env.META_ADS_WRITE_ENABLED;
    const response = await PATCH(new Request("https://example.test/api/social/ads", { method: "PATCH", body: JSON.stringify({ brand: A, account: "act_123", campaignId: "42", status: "PAUSED" }) }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ detail: { code: "meta_ads_write_disabled" } });
    expect(meta.setMetaCampaignStatus).not.toHaveBeenCalled();
  });

  it("checks the requested account before an enabled write", async () => {
    process.env.META_ADS_WRITE_ENABLED = "true";
    meta.assertMetaAdsBrand.mockResolvedValue(undefined);
    meta.setMetaCampaignStatus.mockResolvedValue(undefined);
    const response = await PATCH(new Request("https://example.test/api/social/ads", { method: "PATCH", body: JSON.stringify({ brand: B, account: "act_123", campaignId: "42", status: "PAUSED" }) }));
    expect(response.status).toBe(200);
    expect(meta.assertMetaAdsBrand).toHaveBeenCalledWith(B, "act_123");
    expect(meta.setMetaCampaignStatus).toHaveBeenCalledWith("42", "PAUSED");
  });
});
