// T18: gates on the validated organizationId, after all synchronous body validation and before the
// Trigger.dev dispatch fetch. checkProductionChangeAllowed itself is mocked (covered by
// lib/system-modes/__tests__/production-change-gate.test.ts); this file only proves the wiring.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "owner" }) }));

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

const savedEnv = { ...process.env };
const { POST } = await import("./route");

// This route's UUID_RE requires an RFC 4122 version/variant nibble (v1-5, variant 8/9/a/b).
const ORG_ID = "11111111-1111-4111-8111-111111111111";
function req(body: unknown) {
  return new Request("http://localhost/api/build/provision-services", { method: "POST", body: JSON.stringify(body) });
}
const BODY = { organizationId: ORG_ID, customerEmail: "a@b.com", providers: ["github"] };

beforeEach(() => {
  checkProductionChangeAllowed.mockClear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, text: async () => JSON.stringify({ id: "run-1" }) });
  process.env.TRIGGER_SECRET_KEY = "secret";
});
afterEach(() => {
  process.env = { ...savedEnv };
});

describe("POST /api/build/provision-services -- system-mode gate", () => {
  it("blocked: 423, no Trigger.dev dispatch", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop" });
    const res = await POST(req(BODY));
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ error: "system_mode_blocks_change", mode: "emergency_stop" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allowed: continues to the Trigger.dev dispatch", async () => {
    const res = await POST(req(BODY));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("gates using the validated organizationId", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "unavailable" });
    await POST(req(BODY));
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(null, ORG_ID);
  });
});
