import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  live: vi.fn(),
  insert: vi.fn(),
  staffGuard: vi.fn(),
  owned: [] as Array<{ postiz_integration_id: string }>,
}));
vi.mock("@/lib/social/authz", async (orig) => {
  const actual = await orig<typeof import("@/lib/social/authz")>();
  return { ...actual, requireStaffForNewChannel: (req: Request) => {
    h.staffGuard(req);
    return actual.requireStaffForNewChannel(req);
  } };
});
vi.mock("@/lib/content/postiz", async (orig) => ({
  ...(await orig<typeof import("@/lib/content/postiz")>()), listAllIntegrations: h.live,
}));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ in: async () => ({ data: h.owned, error: null }) }) }),
      insert: h.insert,
    }),
  }),
}));

const BRAND = "11111111-1111-4111-8111-111111111111";
const INTEGRATION = "postiz-channel-1";
const clientRequest = (method: "GET" | "POST") => new Request("http://localhost/api/social/accounts/claim", {
  method,
  headers: { "content-type": "application/json", "x-ops-user-kind": "client", "x-ops-org-id": BRAND, "x-ops-claims-role": "viewer" },
  body: method === "POST" ? JSON.stringify({ brand: BRAND, integration_id: INTEGRATION }) : undefined,
});

beforeEach(() => {
  h.live.mockReset();
  h.insert.mockReset();
  h.staffGuard.mockClear();
  h.owned = [];
});

describe("Postiz channel claims", () => {
  it("rejects an integration already owned by another brand without inserting", async () => {
    const { claimIntegration } = await import("@/lib/social/store");
    h.live.mockResolvedValue([{ id: INTEGRATION, identifier: "bluesky", name: "Account", picture: null, profile: "", disabled: false }]);
    h.owned = [{ postiz_integration_id: INTEGRATION }];

    await expect(claimIntegration(BRAND, INTEGRATION, "ops:owner")).rejects.toMatchObject({ status: 409 });
    expect(h.insert).not.toHaveBeenCalled();
  });

  it("GET and POST refuse a caller who is not staff", async () => {
    const { GET, POST } = await import("../accounts/claim/route");
    expect((await GET(clientRequest("GET"))).status).toBe(403);
    expect((await POST(clientRequest("POST"))).status).toBe(403);
    expect((await GET(new Request("http://localhost/api/social/accounts/claim"))).status).toBe(403);
    expect((await POST(new Request("http://localhost/api/social/accounts/claim", { method: "POST" }))).status).toBe(403);
    expect(h.staffGuard).toHaveBeenCalledTimes(4);
    expect(h.live).not.toHaveBeenCalled();
    expect(h.insert).not.toHaveBeenCalled();
  });
});
