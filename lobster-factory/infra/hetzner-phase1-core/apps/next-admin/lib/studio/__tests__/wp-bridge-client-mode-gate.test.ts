// T18: bridgePost is the ONE non-GET dispatch function every bridge write goes through
// (createWooProduct/createPost/createNewsletter) -- gated once here, on the org of the wp_sites row
// that shares the bridge's host (the source wordpress-core gates on). checkProductionChangeAllowed
// itself is mocked (covered by lib/system-modes/__tests__/production-change-gate.test.ts); this file
// only proves the wiring.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const checkProductionChangeAllowed = vi.hoisted(() =>
  vi.fn(async (_c: unknown, _org: string | null): Promise<{ allowed: boolean; mode: string; reason?: string }> => ({
    allowed: true,
    mode: "normal",
  })),
);
vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed }));

const ORG_A = "22222222-2222-4222-8222-222222222222";
const ORG_B = "33333333-3333-4333-8333-333333333333";
const db = vi.hoisted(() => ({
  on: true,
  rows: [] as Array<{ url: string; organization_id: string | null }>,
  error: null as { message: string } | null,
}));
const fakeClient = vi.hoisted(() => ({
  from: (_t: string) => ({ select: () => ({ eq: async () => ({ data: db.rows, error: db.error }) }) }),
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => (db.on ? fakeClient : null) }));

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

// 32-byte all-0x07 seed -- arbitrary but deterministic; Ed25519 accepts any 32-byte seed.
const SEED_B64 = Buffer.alloc(32, 7).toString("base64");
const savedEnv = { ...process.env };

const { bridgePost } = await import("../../payments/woo");

beforeEach(() => {
  checkProductionChangeAllowed.mockClear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: "committed" }) });
  db.on = true;
  db.rows = [{ url: "https://bridge.example/", organization_id: ORG_A }];
  db.error = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.WPBRIDGE_BASE_URL = "https://bridge.example";
  process.env.WPBRIDGE_KEY_ID = "key-1";
  process.env.WPBRIDGE_PRIVATE_KEY = SEED_B64;
});
afterEach(() => {
  process.env = { ...savedEnv };
  vi.restoreAllMocks();
});

describe("bridgePost -- system-mode gate", () => {
  it("blocked: no HTTP request to the bridge is made", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop" });
    const r = await bridgePost("/post", { title: "x" });
    expect(r).toEqual({ ok: false, error: "system_mode_blocks_change", blockedMode: "emergency_stop" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allowed: continues to the signed HTTP request", async () => {
    const r = await bridgePost("/post", { title: "x" });
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("gates on the org of the wp_sites row sharing the bridge host, per client", async () => {
    db.rows = [
      { url: "https://bridge.example/", organization_id: ORG_A },
      { url: "https://two.example", organization_id: ORG_B },
      { url: "https://unrelated.example", organization_id: null },
    ];
    process.env.WPBRIDGE_SITE_2_BASE_URL = "https://two.example";
    process.env.WPBRIDGE_SITE_2_KEY_ID = "key-2";
    process.env.WPBRIDGE_SITE_2_PRIVATE_KEY = SEED_B64;
    await bridgePost("/post", { title: "x" });
    await bridgePost("/post", { title: "x" }, { clientId: "2" });
    expect(checkProductionChangeAllowed.mock.calls.map((c) => c[1])).toEqual([ORG_A, ORG_B]);
  });

  it("no wp_sites row for the bridge host: organizationId null (global mode only)", async () => {
    db.rows = [];
    await bridgePost("/post", { title: "x" });
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(fakeClient, null);
  });

  it("wp_sites unreadable, or rows on the host naming two orgs: blocked unavailable, no gate guess, no request", async () => {
    db.error = { message: "boom" };
    expect(await bridgePost("/post", { title: "x" })).toEqual({ ok: false, error: "system_mode_blocks_change", blockedMode: "unavailable" });
    db.error = null;
    db.rows = [
      { url: "https://bridge.example", organization_id: ORG_A },
      { url: "https://bridge.example/shop", organization_id: ORG_B },
    ];
    expect(await bridgePost("/post", { title: "x" })).toEqual({ ok: false, error: "system_mode_blocks_change", blockedMode: "unavailable" });
    expect(checkProductionChangeAllowed).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no DB client: the gate is asked with a null client (it answers unavailable)", async () => {
    db.on = false;
    await bridgePost("/post", { title: "x" });
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(null, null);
  });
});
