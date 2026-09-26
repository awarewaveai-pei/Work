// T18: gates on the resolved site's organizationId, after resolveWpSite and before any WP request
// (the placeholder-fetch GET counts as an outbound request too, so the gate runs before it).
// checkProductionChangeAllowed itself is mocked (covered by
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

// releaseId omitted from every request body below, so mediaPersistenceEnabled()'s branch is never
// entered -- delivery-receipts stays unmocked (real module, never called).

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

const { POST } = await import("./route");

function req(body: unknown) {
  return new Request("http://localhost/api/video/embed-to-wp", { method: "POST", body: JSON.stringify(body) });
}
const BODY = { siteId: "1", videoUrl: "https://cdn.example/v.mp4", postId: 5 };

beforeEach(() => {
  checkProductionChangeAllowed.mockClear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) =>
    url.includes("context=edit")
      ? { ok: true, json: async () => ({ content: { raw: "<!-- VIDEO_PLACEHOLDER -->" } }) }
      : { ok: true, json: async () => ({}) },
  );
});

describe("POST /api/video/embed-to-wp -- system-mode gate", () => {
  it("blocked: 423, no WordPress request", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop" });
    const res = await POST(req(BODY));
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ error: "system_mode_blocks_change", mode: "emergency_stop" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allowed: continues to the WordPress fetch+patch requests", async () => {
    const res = await POST(req(BODY));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("gates using the resolved site's organizationId", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "unavailable" });
    await POST(req(BODY));
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(null, ORG_ID);
  });
});
