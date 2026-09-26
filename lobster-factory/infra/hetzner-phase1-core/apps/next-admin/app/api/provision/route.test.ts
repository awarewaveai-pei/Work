// T18: only the hetzner_cloud (billable) dispatch branch is gated -- "none" and "mock" never make
// an outbound call, so they are intentionally NOT gated (asserted below). Gates on the validated
// organizationId, after the billable-enabled check and before the Trigger.dev dispatch fetch.
// checkProductionChangeAllowed itself is mocked (covered by
// lib/system-modes/__tests__/production-change-gate.test.ts); this file only proves the wiring.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "owner" }) }));
vi.mock("@/lib/ops-inbox/verifyIngestToken", () => ({ timingSafeEqual: () => false }));

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

const SITE_ID = "11111111-1111-1111-1111-111111111111";
const ORG_ID = "22222222-2222-2222-2222-222222222222";
function req(body: unknown) {
  return new Request("http://localhost/api/provision", { method: "POST", body: JSON.stringify(body) });
}
const BODY = { siteId: SITE_ID, siteName: "Acme", organizationId: ORG_ID };

beforeEach(() => {
  checkProductionChangeAllowed.mockClear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "run-1" }) });
  process.env.LOBSTER_SERVER_ADAPTER = "hetzner_cloud";
  process.env.LOBSTER_SERVER_PROVISION_ENABLED = "true";
  process.env.TRIGGER_ACCESS_TOKEN = "tok";
});
afterEach(() => {
  process.env = { ...savedEnv };
});

describe("POST /api/provision -- system-mode gate (hetzner_cloud dispatch only)", () => {
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

  it("'none' adapter never dispatches, so the gate is never called", async () => {
    process.env.LOBSTER_SERVER_ADAPTER = "none";
    const res = await POST(req(BODY));
    expect(res.status).toBe(200);
    expect(checkProductionChangeAllowed).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("'mock' adapter never dispatches, so the gate is never called", async () => {
    process.env.LOBSTER_SERVER_ADAPTER = "mock";
    const res = await POST(req(BODY));
    expect(res.status).toBe(200);
    expect(checkProductionChangeAllowed).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
