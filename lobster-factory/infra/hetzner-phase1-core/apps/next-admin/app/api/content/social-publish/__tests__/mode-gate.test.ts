// T18: gates on the already-org-access-checked clientId, after all synchronous body validation and
// before any Postiz call (getPostizConfig/listIntegrations). checkProductionChangeAllowed itself is
// mocked (covered by lib/system-modes/__tests__/production-change-gate.test.ts); this file only
// proves the wiring.
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

const listIntegrations = vi.hoisted(() => vi.fn(async () => []));
vi.mock("@/lib/content/postiz", () => ({
  getPostizConfig: vi.fn(),
  listIntegrations,
  uploadMedia: vi.fn(),
  uploadVideo: vi.fn(),
  createSocialPost: vi.fn(async () => []),
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
});

describe("POST /api/content/social-publish -- system-mode gate", () => {
  it("blocked: 423, no Postiz call", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "maintenance" });
    const res = await POST(req(BODY));
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ error: "system_mode_blocks_change", mode: "maintenance" });
    expect(listIntegrations).not.toHaveBeenCalled();
  });

  it("allowed: continues to the Postiz integration lookup", async () => {
    await POST(req(BODY));
    expect(listIntegrations).toHaveBeenCalled();
  });

  it("gates using clientId", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "unavailable" });
    await POST(req(BODY));
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(null, CLIENT_ID);
  });
});
