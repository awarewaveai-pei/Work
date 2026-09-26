// GET surfaces the pod_order_inbox backlog where modes are changed; POST replays it after a
// successful change to "normal", AFTER the response (next/server after(); a drain is many Printful
// round trips and Cloudflare cuts at 100 s). The data layer (drainPodOrderInbox/getPodOrderInboxStats) is mocked as a unit
// here -- lib/studio/__tests__/pod-order-inbox.test.ts covers it against a real (fake) DB.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/ops-role", () => ({
  resolveOpsRole: vi.fn(() => ({ role: "owner" })),
  canChangeSystemMode: vi.fn(() => true),
}));

const drainPodOrderInbox = vi.hoisted(() => vi.fn(async (): Promise<{ processed: number; blocked: boolean; error?: string }> => ({ processed: 0, blocked: false })));
const STATS0 = { ok: true, deferred: 0, oldestDeferredAgeSeconds: null, retrying: 0, overdueRetries: 0, gaveUp: 0, stuckPending: 0, capped: false };
const getPodOrderInboxStats = vi.hoisted(() => vi.fn(async (): Promise<Record<string, unknown>> => ({})));
vi.mock("../../../../lib/studio/pod-order-inbox", () => ({ drainPodOrderInbox, getPodOrderInboxStats }));

const afterCallbacks = vi.hoisted(() => [] as Array<() => unknown | Promise<unknown>>);
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => void afterCallbacks.push(fn) }));
const runAfter = async () => {
  for (const fn of afterCallbacks.splice(0)) await fn();
};

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
  drainPodOrderInbox.mockClear();
  drainPodOrderInbox.mockResolvedValue({ processed: 0, blocked: false });
  getPodOrderInboxStats.mockClear();
  getPodOrderInboxStats.mockResolvedValue(STATS0);
  getSupabaseServerClient.mockReset();
  getSupabaseWriteClient.mockReset();
});

describe("GET /api/ops/system-modes -- deferred POD order stats (T26)", () => {
  it("supabase not configured: 503, deferred stats never fetched", async () => {
    getSupabaseServerClient.mockReturnValue(null);
    const res = await GET(new Request("http://x/api/ops/system-modes"));
    expect(res.status).toBe(503);
    expect(getPodOrderInboxStats).not.toHaveBeenCalled();
  });

  it("row exists: response carries podOrderInbox", async () => {
    const { client } = makeFakeSupabase({ currentRow: { mode: "normal", reason: "x", set_at: "2026-09-26T00:00:00Z" } });
    getSupabaseServerClient.mockReturnValue(client);
    getPodOrderInboxStats.mockResolvedValue({ ...STATS0, deferred: 3, oldestDeferredAgeSeconds: 7200 });
    const json = await (await GET(new Request("http://x/api/ops/system-modes"))).json();
    expect(json.podOrderInbox).toEqual({ ...STATS0, deferred: 3, oldestDeferredAgeSeconds: 7200 });
    expect(getPodOrderInboxStats).toHaveBeenCalledWith(client);
  });

  it("no row yet (default 'normal'): response still carries podOrderInbox", async () => {
    const { client } = makeFakeSupabase({ currentRow: null });
    getSupabaseServerClient.mockReturnValue(client);
    const json = await (await GET(new Request("http://x/api/ops/system-modes"))).json();
    expect(json.current.mode).toBe("normal");
    expect(json.podOrderInbox).toEqual(STATS0);
  });
});

describe("POST /api/ops/system-modes -- drains deferred POD orders after a change to normal (T26)", () => {
  const post = (body: unknown) => POST(new Request("http://x/api/ops/system-modes", { method: "POST", body: JSON.stringify(body) }));

  it("change to 'maintenance': drain NOT called", async () => {
    const { client } = makeFakeSupabase({ existingRow: { id: "1" } });
    getSupabaseWriteClient.mockReturnValue(client);
    afterCallbacks.length = 0;
    const res = await post({ mode: "maintenance" });
    expect(res.status).toBe(200);
    await runAfter();
    expect(drainPodOrderInbox).not.toHaveBeenCalled();
  });

  it("change to 'normal': the drain runs after the response, with the write client, after the mode row is written", async () => {
    const { client, updateCalls } = makeFakeSupabase({ existingRow: { id: "1" } });
    getSupabaseWriteClient.mockReturnValue(client);
    afterCallbacks.length = 0;
    const res = await post({ mode: "normal" });
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1); // the mode row was written
    expect(drainPodOrderInbox).not.toHaveBeenCalled();
    await runAfter();
    expect(drainPodOrderInbox).toHaveBeenCalledWith(client);
  });

  it("a drain that reports an error does not fail the mode change", async () => {
    const { client } = makeFakeSupabase({ existingRow: { id: "1" } });
    getSupabaseWriteClient.mockReturnValue(client);
    drainPodOrderInbox.mockResolvedValueOnce({ processed: 0, blocked: false, error: "drain boom" });
    const res = await post({ mode: "normal" });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    await runAfter();
  });

  it("forbidden role: 403, drain never called", async () => {
    const opsRole = await import("../../../../lib/ops-role");
    vi.mocked(opsRole.canChangeSystemMode).mockReturnValueOnce(false);
    const res = await post({ mode: "normal" });
    expect(res.status).toBe(403);
    expect(drainPodOrderInbox).not.toHaveBeenCalled();
  });

  it("invalid mode: 400, drain never called", async () => {
    const { client } = makeFakeSupabase({ existingRow: { id: "1" } });
    getSupabaseWriteClient.mockReturnValue(client);
    const res = await post({ mode: "not_a_real_mode" });
    expect(res.status).toBe(400);
    expect(drainPodOrderInbox).not.toHaveBeenCalled();
  });

  it("no existing row (first write): still drains on 'normal'", async () => {
    const { client, insertCalls } = makeFakeSupabase({ existingRow: null });
    getSupabaseWriteClient.mockReturnValue(client);
    afterCallbacks.length = 0;
    const res = await post({ mode: "normal" });
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(1);
    await runAfter();
    expect(drainPodOrderInbox).toHaveBeenCalledWith(client);
  });
});
