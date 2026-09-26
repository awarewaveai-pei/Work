// T18: gates on the org resolved by resolveSocialOrg (the site's org, or the given org id), after all
// synchronous body validation and before any Postiz call (getPostizConfig/listIntegrations). The same
// org keys the Postiz lookup and the post. checkProductionChangeAllowed itself is mocked (covered by
// lib/system-modes/__tests__/production-change-gate.test.ts); this file only proves the wiring.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "owner" }), canCreateAiImageJob: () => true }));

const checkProductionChangeAllowed = vi.hoisted(() =>
  vi.fn(async (_c: unknown, _org: string | null): Promise<{ allowed: boolean; mode: string; reason?: string }> => ({
    allowed: true,
    mode: "normal",
  })),
);
vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => null }));

const SITE_ORG = "00000000-0000-4000-8000-000000000003";
const resolveWpSite = vi.hoisted(() =>
  vi.fn(async (_req: unknown, _id: string) => ({ site: { id: "site-a", organizationId: SITE_ORG as string | null } })),
);
vi.mock("@/lib/content/wp-sites", () => ({ resolveWpSite }));

const listIntegrations = vi.hoisted(() =>
  vi.fn(async (_org: string) => [{ platform: "x", status: "connected", postizIntegrationId: "int-1" }]),
);
const createSocialPost = vi.hoisted(() => vi.fn(async (_o: { clientId: string }) => []));
vi.mock("@/lib/content/postiz", () => ({
  getPostizConfig: vi.fn(),
  listIntegrations,
  uploadMedia: vi.fn(),
  uploadVideo: vi.fn(),
  createSocialPost,
  assertCanPublishNow: vi.fn(),
  PLATFORM_VIDEO_FORMAT: {},
}));

const { POST } = await import("../route");

const CLIENT_ID = "11111111-1111-1111-1111-111111111111";
function req(body: unknown) {
  return new Request("http://localhost/api/content/social-publish", { method: "POST", body: JSON.stringify(body) });
}
const BODY = { clientId: CLIENT_ID, mode: "draft", platforms: [{ platform: "x", content: "hi" }] };

beforeEach(() => {
  checkProductionChangeAllowed.mockClear();
  listIntegrations.mockClear();
  createSocialPost.mockClear();
  resolveWpSite.mockClear();
});

describe("POST /api/content/social-publish -- system-mode gate", () => {
  it("blocked: 423, no Postiz call", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "maintenance" });
    const res = await POST(req(BODY));
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ error: "system_mode_blocks_change", mode: "maintenance" });
    expect(listIntegrations).not.toHaveBeenCalled();
  });

  it("allowed: continues to the Postiz integration lookup and post", async () => {
    await POST(req(BODY));
    expect(listIntegrations).toHaveBeenCalledWith(CLIENT_ID);
    expect(createSocialPost.mock.calls[0][0].clientId).toBe(CLIENT_ID);
  });

  it("gates using clientId", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "unavailable" });
    await POST(req(BODY));
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(null, CLIENT_ID);
  });

  it("siteId (ContentStudio): gate, Postiz lookup and post all use the site's org, never the site id", async () => {
    const { clientId: _omit, ...rest } = BODY;
    await POST(req({ ...rest, siteId: "site-a" }));
    expect(resolveWpSite.mock.calls[0][1]).toBe("site-a");
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(null, SITE_ORG);
    expect(listIntegrations).toHaveBeenCalledWith(SITE_ORG);
    expect(createSocialPost.mock.calls[0][0].clientId).toBe(SITE_ORG);
  });

  it("siteId of a site with no org: 422 before the gate or Postiz", async () => {
    resolveWpSite.mockResolvedValueOnce({ site: { id: "1", organizationId: null } });
    const { clientId: _omit, ...rest } = BODY;
    const res = await POST(req({ ...rest, siteId: "1" }));
    expect(res.status).toBe(422);
    expect(checkProductionChangeAllowed).not.toHaveBeenCalled();
    expect(listIntegrations).not.toHaveBeenCalled();
  });
});
