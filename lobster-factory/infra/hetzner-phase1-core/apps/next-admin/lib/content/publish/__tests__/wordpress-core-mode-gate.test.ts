// T18: publishToWordPress gates on the resolved site's organizationId, after resolveWpSite and input
// validation, before any write to WordPress. On the Bridge path bridgePost gates again; its block must
// surface as 423, not as a 502 bridge failure. checkProductionChangeAllowed itself is mocked (covered by
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

const bridge = vi.hoisted(() => ({
  configured: false,
  createPost: vi.fn(async (): Promise<{ ok: boolean; error?: string; blockedMode?: string; value?: unknown }> => ({ ok: true, value: {} })),
}));
vi.mock("@/lib/studio/wp-bridge-client", () => ({
  BRIDGE_BLOCKED_ERROR: "system_mode_blocks_change",
  isBridgeConfigured: () => bridge.configured,
  bridgeBaseUrl: () => (bridge.configured ? "https://acme.example" : null),
  createPost: bridge.createPost,
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
  bridge.configured = false;
  bridge.createPost.mockClear();
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

  it("invalid input answers 400 before the gate is read", async () => {
    const result = await publishToWordPress({ siteId: "1", markdown: "  " }, req());
    expect(result).toMatchObject({ ok: false, status: 400, error: "markdown required" });
    expect(checkProductionChangeAllowed).not.toHaveBeenCalled();
  });

  it("bridge path: a bridgePost block is 423 with the mode, not a 502 bridge failure", async () => {
    bridge.configured = true;
    bridge.createPost.mockResolvedValueOnce({ ok: false, error: "system_mode_blocks_change", blockedMode: "maintenance" });
    const result = await publishToWordPress(INPUT, req());
    expect(result).toEqual({ ok: false, status: 423, error: "system_mode_blocks_change", wire: "json", mode: "maintenance" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bridge path: any other bridge failure stays 502", async () => {
    bridge.configured = true;
    bridge.createPost.mockResolvedValueOnce({ ok: false, error: "fluentcrm_not_active" });
    const result = await publishToWordPress(INPUT, req());
    expect(result).toEqual({ ok: false, status: 502, error: "bridge: fluentcrm_not_active", wire: "json" });
  });
});
