// T26: GET surfaces the deferred-POD-order backlog where modes are changed; POST drains that backlog
// after a successful change to "normal" (best-effort -- a throwing drain must never fail the mode
// change itself). The data layer (drainDeferredPodOrders/getDeferredPodOrderStats) is mocked as a unit
// here -- lib/studio/__tests__/pod-order-inbox.test.ts covers it against a real (fake) DB.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/ops-role", () => ({
  resolveOpsRole: vi.fn(() => ({ role: "owner" })),
  canChangeSystemMode: vi.fn(() => true),
}));

const drainDeferredPodOrders = vi.hoisted(() => vi.fn(async () => ({ processed: 0 })));
const getDeferredPodOrderStats = vi.hoisted(() => vi.fn(async () => ({ count: 0, oldestAgeSeconds: null, capped: false })));
vi.mock("../../../../lib/studio/pod-order-inbox", () => ({ drainDeferredPodOrders, getDeferredPodOrderStats }));

interface FakeOpts {
  currentRow?: Record<string, unknown> | null;
  existingRow?: { id: string } | null;
}
function makeFakeSupabase(opts: FakeOpts = {}) {
  const updateCalls: unknown[] = [];
  const insertCalls: unknown[] = [];
  const client = {
    from(_t: string) {
      return {
        select: (_cols: string) => ({
          eq: (_c: string, _v: unknown) => ({
            is: (_c2: string, _v2: unknown) => ({
              single: async () =>
                opts.currentRow !== undefined && opts.currentRow !== null
                  ? { data: opts.currentRow, error: null }
                  : { data: null, error: { message: "no rows" } },
              maybeSingle: async () => ({ data: opts.existingRow ?? null, error: null }),
            }),
          }),
        }),
        update: (patch: unknown) => ({
          eq: async (_c: string, _v: unknown) => {
            updateCalls.push(patch);
            return { error: null };
          },
        }),
        insert: async (row: unknown) => {
          insertCalls.push(row);
          return { error: null };
        },
      };
    },
  };
  return { client, updateCalls, insertCalls };
}

const getSupabaseServerClient = vi.hoisted(() => vi.fn());
const getSupabaseWriteClient = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/supabase-server", () => ({ getSupabaseServerClient, getSupabaseWriteClient }));

const { GET, POST } = await import("./route");

beforeEach(() => {
  drainDeferredPodOrders.mockClear();
  drainDeferredPodOrders.mockResolvedValue({ processed: 0 });
  getDeferredPodOrderStats.mockClear();
  getDeferredPodOrderStats.mockResolvedValue({ count: 0, oldestAgeSeconds: null, capped: false });
  getSupabaseServerClient.mockReset();
  getSupabaseWriteClient.mockReset();
});

describe("GET /api/ops/system-modes -- deferred POD order stats (T26)", () => {
  it("supabase not configured: 503, deferred stats never fetched", async () => {
    getSupabaseServerClient.mockReturnValue(null);
    const res = await GET(new Request("http://x/api/ops/system-modes"));
    expect(res.status).toBe(503);
    expect(getDeferredPodOrderStats).not.toHaveBeenCalled();
  });

  it("row exists: response carries deferredPodOrders", async () => {
    const { client } = makeFakeSupabase({ currentRow: { mode: "normal", reason: "x", set_at: "2026-09-26T00:00:00Z" } });
    getSupabaseServerClient.mockReturnValue(client);
    getDeferredPodOrderStats.mockResolvedValue({ count: 3, oldestAgeSeconds: 7200, capped: false });
    const json = await (await GET(new Request("http://x/api/ops/system-modes"))).json();
    expect(json.deferredPodOrders).toEqual({ count: 3, oldestAgeSeconds: 7200, capped: false });
    expect(getDeferredPodOrderStats).toHaveBeenCalledWith(client);
  });

  it("no row yet (default 'normal'): response still carries deferredPodOrders", async () => {
    const { client } = makeFakeSupabase({ currentRow: null });
    getSupabaseServerClient.mockReturnValue(client);
    const json = await (await GET(new Request("http://x/api/ops/system-modes"))).json();
    expect(json.current.mode).toBe("normal");
    expect(json.deferredPodOrders).toEqual({ count: 0, oldestAgeSeconds: null, capped: false });
  });
});

describe("POST /api/ops/system-modes -- drains deferred POD orders after a change to normal (T26)", () => {
  const post = (body: unknown) => POST(new Request("http://x/api/ops/system-modes", { method: "POST", body: JSON.stringify(body) }));

  it("change to 'maintenance': drain NOT called", async () => {
    const { client } = makeFakeSupabase({ existingRow: { id: "1" } });
    getSupabaseWriteClient.mockReturnValue(client);
    const res = await post({ mode: "maintenance" });
    expect(res.status).toBe(200);
    expect(drainDeferredPodOrders).not.toHaveBeenCalled();
  });

  it("change to 'normal': drain IS called with the write client, after the mode row is written", async () => {
    const { client, updateCalls } = makeFakeSupabase({ existingRow: { id: "1" } });
    getSupabaseWriteClient.mockReturnValue(client);
    const res = await post({ mode: "normal" });
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1); // the mode row was written
    expect(drainDeferredPodOrders).toHaveBeenCalledWith(client);
  });

  it("a throwing drain does not fail the mode change (logged, swallowed)", async () => {
    const { client } = makeFakeSupabase({ existingRow: { id: "1" } });
    getSupabaseWriteClient.mockReturnValue(client);
    drainDeferredPodOrders.mockRejectedValueOnce(new Error("drain boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ mode: "normal" });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("forbidden role: 403, drain never called", async () => {
    const opsRole = await import("../../../../lib/ops-role");
    vi.mocked(opsRole.canChangeSystemMode).mockReturnValueOnce(false);
    const res = await post({ mode: "normal" });
    expect(res.status).toBe(403);
    expect(drainDeferredPodOrders).not.toHaveBeenCalled();
  });

  it("invalid mode: 400, drain never called", async () => {
    const { client } = makeFakeSupabase({ existingRow: { id: "1" } });
    getSupabaseWriteClient.mockReturnValue(client);
    const res = await post({ mode: "not_a_real_mode" });
    expect(res.status).toBe(400);
    expect(drainDeferredPodOrders).not.toHaveBeenCalled();
  });

  it("no existing row (first write): still drains on 'normal'", async () => {
    const { client, insertCalls } = makeFakeSupabase({ existingRow: null });
    getSupabaseWriteClient.mockReturnValue(client);
    const res = await post({ mode: "normal" });
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(1);
    expect(drainDeferredPodOrders).toHaveBeenCalledWith(client);
  });
});
