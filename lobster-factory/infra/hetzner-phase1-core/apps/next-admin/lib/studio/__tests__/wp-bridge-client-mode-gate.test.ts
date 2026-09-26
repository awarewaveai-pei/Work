// T18: bridgePost is the ONE non-GET dispatch function every bridge write goes through
// (createWooProduct/createPost/createNewsletter) -- gated once here so every current and future
// caller is covered. checkProductionChangeAllowed itself is mocked (covered by
// lib/system-modes/__tests__/production-change-gate.test.ts); this file only proves the wiring.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const checkProductionChangeAllowed = vi.hoisted(() =>
  vi.fn(async (_c: unknown, _org: string | null): Promise<{ allowed: boolean; mode: string; reason?: string }> => ({
    allowed: true,
    mode: "normal",
  })),
);
vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => null }));

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

// 32-byte all-0x07 seed -- arbitrary but deterministic; Ed25519 accepts any 32-byte seed.
const SEED_B64 = Buffer.alloc(32, 7).toString("base64");
const savedEnv = { ...process.env };

const { bridgePost } = await import("../wp-bridge-client");

beforeEach(() => {
  checkProductionChangeAllowed.mockClear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: "committed" }) });
  process.env.WPBRIDGE_BASE_URL = "https://bridge.example";
  process.env.WPBRIDGE_KEY_ID = "key-1";
  process.env.WPBRIDGE_PRIVATE_KEY = SEED_B64;
});
afterEach(() => {
  process.env = { ...savedEnv };
});

describe("bridgePost -- system-mode gate", () => {
  it("blocked: no HTTP request to the bridge is made", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop" });
    const r = await bridgePost("/post", { title: "x" });
    expect(r).toEqual({ ok: false, error: "system_mode_blocks_change", mode: "emergency_stop" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allowed: continues to the signed HTTP request", async () => {
    const r = await bridgePost("/post", { title: "x" });
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("gates with organizationId null (env-configured bridge, no organizations row)", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "unavailable" });
    await bridgePost("/post", { title: "x" });
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(null, null);
  });
});
