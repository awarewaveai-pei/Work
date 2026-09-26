// T18: publishToWordPress gates on the resolved site's organizationId, after resolveWpSite and
// before any write to WordPress (both the standard-REST and the Bridge path share this one gate).
// checkProductionChangeAllowed itself is mocked (covered by
// lib/system-modes/__tests__/production-change-gate.test.ts); this file only proves the wiring.
import { beforeEach, describe, expect, it, vi } from "vitest";

const checkProductionChangeAllowed = vi.hoisted(() =>
  vi.fn(async (_c: unknown, _org: string | null): Promise<{ allowed: boolean; mode: string; reason?: string }> => ({
    allowed: true,
    mode: "normal",
  })),
);
vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => null }));

const SITE = {
  id: "1",
  name: "Acme",
  url: "https://acme.example",
  color: "#000",
  username: "admin",
  organizationId: "11111111-1111-1111-1111-111111111111",
};
const resolveWpSite = vi.hoisted(() =>
  vi.fn(async () => ({ site: SITE, token: "tok", username: "admin", authHeader: "Basic xxx" })),
);
const getWpSites = vi.hoisted(() => vi.fn(async () => ({ sites: [SITE], tokens: { "1": "tok" }, usernames: { "1": "admin" } })));
vi.mock("@/lib/content/wp-sites", () => ({
  resolveWpSite,
  getWpSites,
  wpAuthHeader: (u: string, t: string) => `Basic ${u}:${t}`,
}));

// Bridge path is not exercised here (isBridgeConfigured: false) -- kept as a no-op stand-in so the
// module loads; the standard-REST path is what this file drives.
vi.mock("@/lib/studio/wp-bridge-client", () => ({
  isBridgeConfigured: () => false,
  bridgeBaseUrl: () => null,
  createPost: vi.fn(),
}));

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

const { publishToWordPress } = await import("../wordpress-core");

function req() {
  return new Request("http://localhost/api/content/publish", { method: "POST" });
}
const INPUT = { markdown: "# Hi\n\nSome body text.", siteId: "1" };

beforeEach(() => {
  checkProductionChangeAllowed.mockClear();
  resolveWpSite.mockClear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: 5, link: "https://acme.example/?p=5" }) });
});

describe("publishToWordPress -- system-mode gate", () => {
  it("blocked: no HTTP request to WordPress is made", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop", reason: "system in emergency_stop" });
    const result = await publishToWordPress(INPUT, req());
    expect(result).toEqual({ ok: false, status: 423, error: "system_mode_blocks_change", wire: "json", mode: "emergency_stop" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allowed: continues to the standard-REST WordPress write", async () => {
    const result = await publishToWordPress(INPUT, req());
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("gates using the resolved site's organizationId", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "unavailable", reason: "x" });
    await publishToWordPress(INPUT, req());
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(null, SITE.organizationId);
  });
});
