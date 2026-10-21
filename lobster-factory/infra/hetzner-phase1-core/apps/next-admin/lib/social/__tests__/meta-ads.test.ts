import { afterEach, describe, expect, it, vi } from "vitest";
import { assertMetaAdsBrand, getMetaAdsConfig, listMetaCampaigns, setMetaCampaignStatus } from "../meta-ads";

afterEach(() => vi.restoreAllMocks());

describe("Meta Marketing API adapter", () => {
  it("fails closed when the server-side token is absent", () => {
    expect(() => getMetaAdsConfig({})).toThrow("META_MARKETING_ACCESS_TOKEN");
  });

  it("normalises an ad account id and never puts the token in the URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "1", name: "A" }] }), { status: 200 }));
    await listMetaCampaigns("act_123", { META_MARKETING_ACCESS_TOKEN: "secret-token", META_MARKETING_API_VERSION: "v24.0" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/v24.0/act_123/campaigns");
    expect(String(url)).not.toContain("secret-token");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
  });

  it("only permits ACTIVE and PAUSED campaign writes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await setMetaCampaignStatus("42", "PAUSED", { META_MARKETING_ACCESS_TOKEN: "secret-token" });
    expect(fetchMock).toHaveBeenCalledOnce();
    await expect(setMetaCampaignStatus("not-an-id", "PAUSED", { META_MARKETING_ACCESS_TOKEN: "secret-token" })).rejects.toThrow("活動 ID 格式不正確");
  });

  it("binds the deployment token to one explicit brand", () => {
    expect(() => assertMetaAdsBrand("brand-1", { META_MARKETING_ACCESS_TOKEN: "secret-token" })).toThrow("META_MARKETING_ORGANIZATION_ID");
    expect(() => assertMetaAdsBrand("brand-2", { META_MARKETING_ORGANIZATION_ID: "brand-1" })).toThrow("未綁定");
    expect(() => assertMetaAdsBrand("brand-1", { META_MARKETING_ORGANIZATION_ID: "brand-1" })).not.toThrow();
  });
});
