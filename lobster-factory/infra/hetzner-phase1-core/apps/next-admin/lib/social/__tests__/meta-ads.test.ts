import { afterEach, describe, expect, it, vi } from "vitest";
const assets = vi.hoisted(() => ({ listMetaAssets: vi.fn(), findEnabledMetaAssetForBrand: vi.fn() }));
vi.mock("../store", () => assets);
import { assertMetaAdsBrand, getMetaAdsConfig, listMetaAdAccounts, listMetaCampaigns, setMetaCampaignStatus } from "../meta-ads";

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("Meta Marketing API adapter", () => {
  it("fails closed when the server-side token is absent", () => {
    expect(() => getMetaAdsConfig({})).toThrow("META_MARKETING_ACCESS_TOKEN");
  });

  it("normalises an ad account id and never puts the token in the URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "1", name: "A" }] }), { status: 200 }));
    await listMetaCampaigns("act_123", { META_MARKETING_ACCESS_TOKEN: "secret-token", META_GRAPH_API_VERSION: "v24.0" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/v24.0/act_123/campaigns");
    expect(String(url)).not.toContain("secret-token");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
  });

  it("lists only accounts mapped to the requested brand", async () => {
    assets.listMetaAssets.mockResolvedValue([{ id: "asset-a", organizationId: "brand-a", kind: "ad_account", externalId: "act_123", pageExternalId: null, label: null, enabled: true }]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "123", name: "A" }, { id: "456", name: "B" }] }), { status: 200 }));
    await expect(listMetaAdAccounts("brand-a", { META_MARKETING_ACCESS_TOKEN: "secret-token" })).resolves.toEqual([expect.objectContaining({ id: "123" })]);
  });

  it("only permits ACTIVE and PAUSED campaign writes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ account_id: "123", id: "42" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await setMetaCampaignStatus("act_123", "42", "PAUSED", { META_MARKETING_ACCESS_TOKEN: "secret-token" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]?.method).toBe("POST");
    await expect(setMetaCampaignStatus("act_123", "not-an-id", "PAUSED", { META_MARKETING_ACCESS_TOKEN: "secret-token" })).rejects.toThrow("活動 ID 格式不正確");
  });

  it("refuses to write a campaign that sits in another brand's ad account", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ account_id: "456", id: "42" }), { status: 200 }));
    await expect(setMetaCampaignStatus("act_123", "42", "PAUSED", { META_MARKETING_ACCESS_TOKEN: "secret-token" }))
      .rejects.toMatchObject({ status: 403, code: "meta_ads_campaign_mismatch" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.method).toBe("GET");
  });

  it("blocks a cross-brand account before any Meta call", async () => {
    assets.findEnabledMetaAssetForBrand.mockResolvedValue(null);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(assertMetaAdsBrand("brand-a", "act-456")).rejects.toMatchObject({ status: 403, code: "meta_ads_brand_mismatch" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts an enabled account mapped to the requested brand", async () => {
    assets.findEnabledMetaAssetForBrand.mockResolvedValue({ organizationId: "brand-a", kind: "ad_account", externalId: "456", enabled: true });
    await expect(assertMetaAdsBrand("brand-a", "act_456")).resolves.toBeUndefined();
  });
});
