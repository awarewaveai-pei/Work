import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ listAccounts: vi.fn() }));
const cis = vi.hoisted(() => ({ loadCis: vi.fn() }));
const chatwoot = vi.hoisted(() => ({ getInboxUnreadCount: vi.fn() }));
vi.mock("@/lib/social/store", () => store);
vi.mock("@/lib/cs/cis", () => cis);
vi.mock("@/lib/cs/chatwoot-client", () => chatwoot);

const BRAND = "11111111-1111-4111-8111-111111111111";

function req(role = "owner"): Request {
  return new Request(`http://localhost/api/social/inbox?brand=${BRAND}`, {
    headers: { "x-ops-user-kind": "staff", "x-ops-claims-role": role },
  });
}

beforeEach(() => {
  store.listAccounts.mockReset();
  cis.loadCis.mockReset();
  chatwoot.getInboxUnreadCount.mockReset();
  cis.loadCis.mockResolvedValue({ organizationId: BRAND, chatwoot: { accountId: 42, baseUrl: "https://chatwoot.example" } });
  store.listAccounts.mockResolvedValue([
    { id: "facebook-1", platform: "facebook", label: "品牌粉專", handle: "brand", picture: null, chatwoot_inbox_id: 7 },
    { id: "ig-1", platform: "instagram", label: "品牌 IG", handle: "brand_ig", picture: null, chatwoot_inbox_id: null },
  ]);
  chatwoot.getInboxUnreadCount.mockResolvedValue(3);
});

describe("GET /api/social/inbox", () => {
  it("returns per-channel unread totals and a safe Chatwoot link without token data", async () => {
    const { GET } = await import("./route");
    const body = await (await GET(req())).json();
    expect(body.inboxes).toEqual([
      expect.objectContaining({ accountId: "facebook-1", unread: 3, status: "ok", chatwootUrl: "https://chatwoot.example/app/accounts/42/inbox/7" }),
      expect.objectContaining({ accountId: "ig-1", unread: 0, status: "unlinked", chatwootUrl: null }),
    ]);
    expect(body.home).toBe("https://chatwoot.example/app/accounts/42/conversations");
    expect(JSON.stringify(body)).not.toContain("token");
    expect(store.listAccounts).toHaveBeenCalledWith(BRAND, { hydrateProfile: false });
    expect(chatwoot.getInboxUnreadCount).toHaveBeenCalledWith(BRAND, { accountId: 42, baseUrl: "https://chatwoot.example" }, 7);
  });

  it("keeps one unavailable inbox from hiding the other channels", async () => {
    const { GET } = await import("./route");
    chatwoot.getInboxUnreadCount.mockRejectedValueOnce(new Error("chatwoot_api_503"));
    const body = await (await GET(req())).json();
    expect(body.inboxes[0]).toEqual(expect.objectContaining({ status: "unavailable", unread: 0 }));
    expect(body.inboxes[1]).toEqual(expect.objectContaining({ status: "unlinked" }));
  });

  it("treats Chatwoot auth failures as missing read configuration", async () => {
    const { GET } = await import("./route");
    chatwoot.getInboxUnreadCount.mockRejectedValueOnce(new Error("chatwoot_api_401"));
    const body = await (await GET(req())).json();
    expect(body.inboxes[0]).toEqual(expect.objectContaining({ status: "not_configured", unread: 0 }));
  });

  it("keeps a path prefix in the Chatwoot link", async () => {
    const { GET } = await import("./route");
    cis.loadCis.mockResolvedValue({ organizationId: BRAND, chatwoot: { accountId: 42, baseUrl: "https://host.example/chatwoot/" } });
    const body = await (await GET(req())).json();
    expect(body.inboxes[0].chatwootUrl).toBe("https://host.example/chatwoot/app/accounts/42/inbox/7");
    expect(body.home).toBe("https://host.example/chatwoot/app/accounts/42/conversations");
  });

  it("does not emit a non-http Chatwoot link", async () => {
    const { GET } = await import("./route");
    cis.loadCis.mockResolvedValue({ organizationId: BRAND, chatwoot: { accountId: 42, baseUrl: "javascript:alert(1)" } });
    const body = await (await GET(req())).json();
    expect(body.inboxes[0].chatwootUrl).toBeNull();
  });

  it("does not emit a Chatwoot link containing URL credentials", async () => {
    const { GET } = await import("./route");
    cis.loadCis.mockResolvedValue({ organizationId: BRAND, chatwoot: { accountId: 42, baseUrl: "https://user:password@chatwoot.example" } });
    const text = await (await GET(req())).text();
    expect(JSON.parse(text).inboxes[0].chatwootUrl).toBeNull();
    expect(JSON.parse(text).home).toBeNull();
    expect(text).not.toContain("password");
  });

  it("enforces the existing brand role gate", async () => {
    const { GET } = await import("./route");
    const otherClient = new Request(`http://localhost/api/social/inbox?brand=${BRAND}`, {
      headers: { "x-ops-user-kind": "client", "x-ops-org-id": "22222222-2222-4222-8222-222222222222", "x-ops-claims-role": "viewer" },
    });
    expect((await GET(otherClient)).status).toBe(403);
    expect(store.listAccounts).not.toHaveBeenCalled();
  });
});
