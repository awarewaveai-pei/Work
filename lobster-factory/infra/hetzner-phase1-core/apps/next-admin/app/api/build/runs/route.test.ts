// T19: build/runs POST gates on the caller-supplied organizationId before any row is written --
// checkProductionChangeAllowed itself is mocked (covered by
// lib/system-modes/__tests__/production-change-gate.test.ts) -- this file only proves the wiring:
// blocked -> blockedChangeResponse(mode), no ops_action_catalog/ops_action_runs read/insert, no
// dispatcher kick; allowed -> the existing enqueue flow runs unchanged. Profile A is used throughout
// because it skips ensureBuildRegistryRows' organizations/workspaces/projects/sites writes entirely
// (input.profile !== "profile_b" && !== "profile_c"), keeping the fake Supabase client to only the
// tables the enqueue path itself touches.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blockedChangeBody } from "../../../../lib/system-modes/blocked-change";

const checkProductionChangeAllowed = vi.hoisted(() =>
  vi.fn(async (_client: unknown, _org: string | null): Promise<{ allowed: boolean; mode: string; reason?: string }> => ({
    allowed: true,
    mode: "normal",
  })),
);
vi.mock("../../../../lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed }));

vi.mock("../../../../lib/ops-role", () => ({
  resolveOpsRole: () => ({ role: "operator", source: "simulated" }),
}));

const kickActionRunDispatcher = vi.hoisted(() => vi.fn(async () => ({ attempted: true, ok: true, httpStatus: 200 })));
vi.mock("../../../../lib/kick-dispatcher", () => ({ kickActionRunDispatcher }));

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function fakeSupabase() {
  const from = vi.fn((table: string) => {
    if (table === "ops_action_catalog") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: "action-1", enabled: true }, error: null }),
          }),
        }),
      };
    }
    if (table === "ops_action_runs") {
      return {
        insert: () => ({
          select: () => ({
            single: async () => ({ data: { id: "run-mock-id" }, error: null }),
          }),
        }),
      };
    }
    if (table === "ops_audit_events") {
      return { insert: async () => ({}) };
    }
    throw new Error(`unexpected table in this test's fake Supabase client: ${table}`);
  });
  return { from };
}

const getSupabaseWriteClient = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/supabase-server", () => ({ getSupabaseWriteClient }));

const { POST } = await import("./route");
let writeFake: ReturnType<typeof fakeSupabase>;

function post(overrides: Record<string, unknown> = {}) {
  const request = new Request("http://localhost/api/build/runs", {
    method: "POST",
    body: JSON.stringify({
      profile: "profile_a",
      executionMode: "enqueue",
      organizationId: ORG_ID,
      clientName: "Test Co",
      domain: "example.com",
      ...overrides,
    }),
  });
  return POST(request);
}

beforeEach(() => {
  checkProductionChangeAllowed.mockClear();
  kickActionRunDispatcher.mockClear();
  writeFake = fakeSupabase();
  getSupabaseWriteClient.mockReturnValue(writeFake);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/build/runs -- system-mode gate", () => {
  it("blocked: 423 with blockedChangeBody(mode), no ops_action_runs insert and no dispatcher kick", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop", reason: "system in emergency_stop" });

    const res = await post();

    expect(res.status).toBe(423);
    expect(await res.json()).toEqual(blockedChangeBody("emergency_stop"));
    expect(writeFake.from).not.toHaveBeenCalled();
    expect(kickActionRunDispatcher).not.toHaveBeenCalled();
  });

  it("gates on the caller-supplied organizationId", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "unavailable", reason: "system_modes unreadable (fail closed)" });

    await post();

    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(writeFake, ORG_ID);
  });

  it("allowed: enqueue proceeds unchanged -- inserts the run and kicks the dispatcher", async () => {
    const res = await post();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; run: { dbWrite: { executed: boolean }; dispatcherKick: unknown } };
    expect(body.ok).toBe(true);
    expect(body.run.dbWrite.executed).toBe(true);
    expect(writeFake.from).toHaveBeenCalledWith("ops_action_runs");
    expect(kickActionRunDispatcher).toHaveBeenCalledTimes(1);
  });
});
