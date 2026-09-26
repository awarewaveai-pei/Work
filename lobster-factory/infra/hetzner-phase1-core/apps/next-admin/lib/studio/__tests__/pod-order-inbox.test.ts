// T26: direct coverage of the pod_order_inbox data layer (upsert/mark/drain/stats) against a
// hand-rolled fake Supabase client -- the route-level wiring (upsert-before-gate, deferred-on-block,
// drain-on-mode-normal) is covered separately by app/api/webhooks/woo-order/route.test.ts and
// app/api/ops/system-modes/route.test.ts, which mock this module entirely.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const checkProductionChangeAllowed = vi.hoisted(() =>
  vi.fn(async (): Promise<{ allowed: boolean; mode: string; reason?: string }> => ({ allowed: true, mode: "normal" })),
);
vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed }));

const createDraftOrderOnNative = vi.hoisted(() => vi.fn());
vi.mock("../print-provider", () => ({ createDraftOrderOnNative }));

const {
  upsertPodOrderInbox,
  markPodOrderInbox,
  drainDeferredPodOrders,
  getDeferredPodOrderStats,
} = await import("../pod-order-inbox");

type Row = Record<string, unknown>;

// Minimal fluent fake matching exactly the four query shapes pod-order-inbox.ts issues:
//   .from(T).upsert(row, opts)                          (await-ed directly)
//   .from(T).update(patch).eq(col, val)                 (await-ed directly)
//   .from(T).select(cols).eq(col, val).order(c,o).limit(n) (await-ed directly)
function makeFakeDb(initialRows: Row[] = []) {
  const rows: Row[] = initialRows.map((r) => ({ ...r }));
  const upsertCalls: { row: Row; opts: unknown }[] = [];
  const updateCalls: { patch: Row; col: string; val: unknown }[] = [];

  const client = {
    from(_table: string) {
      return {
        upsert: async (row: Row, opts: unknown) => {
          upsertCalls.push({ row, opts });
          const i = rows.findIndex((r) => r.woo_order_id === row.woo_order_id);
          if (i >= 0) rows[i] = { ...rows[i], ...row };
          else rows.push({ created_at: new Date().toISOString(), ...row });
          return { error: null };
        },
        update: (patch: Row) => ({
          eq: async (col: string, val: unknown) => {
            updateCalls.push({ patch, col, val });
            const i = rows.findIndex((r) => r[col] === val);
            if (i >= 0) rows[i] = { ...rows[i], ...patch };
            return { error: null };
          },
        }),
        select: (_cols: string) => ({
          eq: (col: string, val: unknown) => ({
            order: (orderCol: string, opts: { ascending: boolean }) => ({
              limit: async (n: number) => {
                const filtered = rows.filter((r) => r[col] === val);
                filtered.sort((a, b) => {
                  const cmp = String(a[orderCol]).localeCompare(String(b[orderCol]));
                  return opts.ascending ? cmp : -cmp;
                });
                return { data: filtered.slice(0, n).map((r) => ({ ...r })), error: null };
              },
            }),
          }),
        }),
      };
    },
  };
  return { client: client as unknown as SupabaseClient, rows, upsertCalls, updateCalls };
}

const RECIPIENT = { name: "A B", address1: "1 St", city: "Taipei", country_code: "TW", zip: "100" };

beforeEach(() => {
  checkProductionChangeAllowed.mockClear();
  checkProductionChangeAllowed.mockResolvedValue({ allowed: true, mode: "normal" });
  createDraftOrderOnNative.mockReset();
});

describe("upsertPodOrderInbox", () => {
  it("upserts status='pending' keyed on woo_order_id", async () => {
    const { client, upsertCalls } = makeFakeDb();
    const r = await upsertPodOrderInbox(client, "7164", null, { recipient: RECIPIENT, items: [{ sku: "A", quantity: 1 }] });
    expect(r).toEqual({ ok: true });
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].row).toMatchObject({ woo_order_id: "7164", organization_id: null, status: "pending" });
    expect(upsertCalls[0].opts).toEqual({ onConflict: "woo_order_id" });
  });

  it("a retry (same woo_order_id) updates the one row, never creates a second", async () => {
    const { client, rows } = makeFakeDb();
    await upsertPodOrderInbox(client, "7164", null, { recipient: RECIPIENT, items: [] });
    await upsertPodOrderInbox(client, "7164", null, { recipient: RECIPIENT, items: [] });
    expect(rows).toHaveLength(1);
  });

  it("a DB error surfaces as ok:false", async () => {
    const erroringClient = {
      from: () => ({ upsert: async () => ({ error: { message: "conn refused" } }) }),
    } as unknown as SupabaseClient;
    const r = await upsertPodOrderInbox(erroringClient, "7164", null, { recipient: RECIPIENT, items: [] });
    expect(r).toEqual({ ok: false, error: "conn refused" });
  });
});

describe("markPodOrderInbox", () => {
  it("'done' sets done_at; 'deferred' and 'failed' do not", async () => {
    const { client, rows } = makeFakeDb([{ woo_order_id: "1", status: "pending" }]);
    await markPodOrderInbox(client, "1", { status: "done" });
    expect(rows[0].status).toBe("done");
    expect(rows[0].done_at).toBeDefined();

    const { client: c2, rows: r2 } = makeFakeDb([{ woo_order_id: "1", status: "pending" }]);
    await markPodOrderInbox(c2, "1", { status: "deferred", reason: "emergency_stop" });
    expect(r2[0].status).toBe("deferred");
    expect(r2[0].reason).toBe("emergency_stop");
    expect(r2[0].done_at).toBeUndefined();
  });

  it("never throws on a DB error (bookkeeping failure must not become a 5xx upstream)", async () => {
    const erroringClient = {
      from: () => ({ update: () => ({ eq: async () => ({ error: { message: "boom" } }) }) }),
    } as unknown as SupabaseClient;
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(markPodOrderInbox(erroringClient, "1", { status: "failed", reason: "x" })).resolves.toBeUndefined();
  });
});

describe("drainDeferredPodOrders", () => {
  const deferredRow = (id: string, createdAt: string) => ({
    woo_order_id: id,
    status: "deferred",
    created_at: createdAt,
    payload: { recipient: RECIPIENT, items: [{ sku: "A", quantity: 1 }] },
  });

  it("processes deferred rows oldest-first while the gate allows", async () => {
    const { client, rows } = makeFakeDb([
      deferredRow("newer", "2026-09-26T02:00:00Z"),
      deferredRow("older", "2026-09-26T01:00:00Z"),
    ]);
    createDraftOrderOnNative.mockResolvedValue({ ok: true, value: { printfulOrderId: 1, status: "draft", alreadyExisted: false } });
    const r = await drainDeferredPodOrders(client);
    expect(r).toEqual({ processed: 2 });
    expect(createDraftOrderOnNative.mock.calls.map((c) => c[0].externalId)).toEqual(["older", "newer"]);
    expect(rows.find((row) => row.woo_order_id === "older")?.status).toBe("done");
    expect(rows.find((row) => row.woo_order_id === "newer")?.status).toBe("done");
  });

  it("stops the moment the gate blocks mid-batch -- the rest stay deferred", async () => {
    const { client, rows } = makeFakeDb([deferredRow("a", "2026-09-26T01:00:00Z"), deferredRow("b", "2026-09-26T02:00:00Z")]);
    checkProductionChangeAllowed
      .mockResolvedValueOnce({ allowed: true, mode: "normal" })
      .mockResolvedValueOnce({ allowed: false, mode: "emergency_stop" });
    createDraftOrderOnNative.mockResolvedValue({ ok: true, value: { printfulOrderId: 1, status: "draft", alreadyExisted: false } });
    const r = await drainDeferredPodOrders(client);
    expect(r).toEqual({ processed: 1 });
    expect(createDraftOrderOnNative).toHaveBeenCalledTimes(1);
    expect(rows.find((row) => row.woo_order_id === "a")?.status).toBe("done");
    expect(rows.find((row) => row.woo_order_id === "b")?.status).toBe("deferred"); // untouched
  });

  it("a failed Printful call marks the row 'failed' (not stuck 'deferred', not re-thrown)", async () => {
    const { client, rows } = makeFakeDb([deferredRow("a", "2026-09-26T01:00:00Z")]);
    createDraftOrderOnNative.mockResolvedValue({ ok: false, error: "printful_502" });
    const r = await drainDeferredPodOrders(client);
    expect(r).toEqual({ processed: 1 });
    expect(rows[0].status).toBe("failed");
    expect(rows[0].reason).toBe("printful_502");
  });

  it("no deferred rows: no-op", async () => {
    const { client } = makeFakeDb([]);
    const r = await drainDeferredPodOrders(client);
    expect(r).toEqual({ processed: 0 });
    expect(createDraftOrderOnNative).not.toHaveBeenCalled();
  });
});

describe("getDeferredPodOrderStats", () => {
  it("counts deferred rows and reports the oldest one's age", async () => {
    const now = Date.now();
    const oldest = new Date(now - 3600_000).toISOString(); // 1h ago
    const { client } = makeFakeDb([
      { woo_order_id: "a", status: "deferred", created_at: oldest },
      { woo_order_id: "b", status: "deferred", created_at: new Date(now - 60_000).toISOString() },
      { woo_order_id: "c", status: "done", created_at: new Date(now).toISOString() },
    ]);
    const stats = await getDeferredPodOrderStats(client);
    expect(stats.count).toBe(2);
    expect(stats.oldestAgeSeconds).toBeGreaterThanOrEqual(3599);
    expect(stats.capped).toBe(false);
  });

  it("no deferred rows: count 0, oldestAgeSeconds null", async () => {
    const { client } = makeFakeDb([{ woo_order_id: "a", status: "done", created_at: new Date().toISOString() }]);
    expect(await getDeferredPodOrderStats(client)).toEqual({ count: 0, oldestAgeSeconds: null, capped: false });
  });
});
