// T18: both PATCH and DELETE gate on the resolved site's organizationId, after resolveWpSite and input
// validation, before any WP request. checkProductionChangeAllowed itself is mocked (covered by
// lib/system-modes/__tests__/production-change-gate.test.ts); this file only proves the wiring.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { blockedChangeBody } from "@/lib/system-modes/blocked-change";

vi.mock("@/lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "owner" }), canCreateAiImageJob: () => true }));

const checkProductionChangeAllowed = vi.hoisted(() =>
  vi.fn(async (_c: unknown, _org: string | null): Promise<{ allowed: boolean; mode: string; reason?: string }> => ({
    allowed: true,
    mode: "normal",
  })),
);
vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => null }));

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const resolveWpSite = vi.hoisted(() =>
  vi.fn(async () => ({
    site: { id: "1", url: "https://acme.example", organizationId: ORG_ID },
    token: "tok",
    username: "admin",
    authHeader: "Basic xxx",
  })),
);
vi.mock("@/lib/content/wp-sites", () => ({ resolveWpSite }));

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

const { PATCH, DELETE } = await import("./route");

function req(method: string, body: unknown) {
  return new Request("http://localhost/api/content/wp-post", { method, body: JSON.stringify(body) });
}

beforeEach(() => {
  checkProductionChangeAllowed.mockClear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: 5, status: "draft", date: "x", link: "y" }) });
});

describe("PATCH /api/content/wp-post -- system-mode gate", () => {
  it("blocked: 423, no WordPress request", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop" });
    const res = await PATCH(req("PATCH", { siteId: "1", postId: 5, title: "x" }));
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual(blockedChangeBody("emergency_stop"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allowed: continues to the WordPress update request", async () => {
    const res = await PATCH(req("PATCH", { siteId: "1", postId: 5, title: "x" }));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("gates using the resolved site's organizationId", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "unavailable" });
    await PATCH(req("PATCH", { siteId: "1", postId: 5, title: "x" }));
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(null, ORG_ID);
  });

  it("nothing to update: 400 before the gate is read", async () => {
    const res = await PATCH(req("PATCH", { siteId: "1", postId: 5 }));
    expect(res.status).toBe(400);
    expect(checkProductionChangeAllowed).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/content/wp-post -- system-mode gate", () => {
  it("blocked: 423, no WordPress request", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "read_only" });
    const res = await DELETE(req("DELETE", { siteId: "1", postId: 5 }));
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual(blockedChangeBody("read_only"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allowed: continues to the WordPress delete request", async () => {
    const res = await DELETE(req("DELETE", { siteId: "1", postId: 5 }));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("gates using the resolved site's organizationId", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "unavailable" });
    await DELETE(req("DELETE", { siteId: "1", postId: 5 }));
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(null, ORG_ID);
  });
});
