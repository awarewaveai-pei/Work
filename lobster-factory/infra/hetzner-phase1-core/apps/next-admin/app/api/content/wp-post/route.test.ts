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

// Card SF-I2: a site the site flow registered has no REST credential. Both writes say so (503) and send nothing --
// before this they answered 404 "Site not found", which reads as a wrong site id.
describe("/api/content/wp-post -- a site with no REST credential", () => {
  const noToken = { site: { id: "9", url: "https://reg.example", organizationId: ORG_ID }, token: "", username: "", authHeader: "" };
  it("PATCH and DELETE: 503 bridge-only, no WordPress request", async () => {
    for (const [fn, method] of [[PATCH, "PATCH"], [DELETE, "DELETE"]] as const) {
      resolveWpSite.mockResolvedValueOnce(noToken);
      const res = await fn(req(method, { siteId: "9", postId: 5, title: "x" }));
      expect(res.status).toBe(503);
      expect((await res.json()).error).toContain("bridge");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("a site that does not exist is still 404", async () => {
    resolveWpSite.mockResolvedValueOnce(null as never);
    expect((await DELETE(req("DELETE", { siteId: "nope", postId: 5 }))).status).toBe(404);
    resolveWpSite.mockResolvedValueOnce(null as never);
    expect((await PATCH(req("PATCH", { siteId: "nope", postId: 5, title: "x" }))).status).toBe(404);
  });
});
