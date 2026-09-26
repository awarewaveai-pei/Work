// pod_order_inbox data layer against an in-memory PostgREST fake that implements exactly the filters
// the module uses (eq/neq/in/lt, order, limit, maybeSingle, update...select). Route wiring is covered by
// app/api/webhooks/woo-order/route.test.ts and app/api/ops/system-modes/route.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const checkProductionChangeAllowed = vi.hoisted(() =>
  vi.fn(async (_db: unknown, _org: string | null): Promise<{ allowed: boolean; mode: string; reason?: string }> => ({ allowed: true, mode: "normal" })),
);
vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed }));

const createDraftOrderOnNative = vi.hoisted(() => vi.fn());
vi.mock("../print-provider", () => ({ createDraftOrderOnNative }));

const inbox = await import("../pod-order-inbox");
const { MAX_ATTEMPTS, OVERDUE_MARGIN_MS, RETRY_BASE_MS, STALE_PENDING_MS } = inbox;

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

function makeFakeDb(seed: Row[] = [], fail: { upsert?: string; select?: string; update?: string } = {}) {
  const rows: Row[] = seed.map((r) => ({ ...r }));
  let clock = Date.parse("2026-09-26T00:00:00Z");
  const stamp = () => new Date(clock++).toISOString();

  function builder() {
    const st: { op: "select" | "update" | "upsert"; patch?: Row; row?: Row; opts?: { ignoreDuplicates?: boolean }; filters: Filter[]; order?: [string, boolean]; limit?: number; returning: boolean } = {
      op: "select",
      filters: [],
      returning: false,
    };
    const run = (single: boolean) => {
      if (fail[st.op]) return { data: null, error: { message: fail[st.op] } };
      if (st.op === "upsert") {
        const r = st.row!;
        const i = rows.findIndex((x) => x.woo_order_id === r.woo_order_id);
        const now = stamp();
        if (i < 0) rows.push({ status: "pending", attempts: 0, reason: null, created_at: now, updated_at: now, done_at: null, ...r });
        else if (!st.opts?.ignoreDuplicates) rows[i] = { ...rows[i], ...r };
        return { data: null, error: null };
      }
      const hit = rows.filter((r) => st.filters.every((f) => f(r)));
      if (st.op === "update") {
        for (const r of hit) Object.assign(r, st.patch);
        return { data: st.returning ? hit.map((r) => ({ ...r })) : null, error: null };
      }
      let out = hit.map((r) => ({ ...r }));
      if (st.order) {
        const [col, asc] = st.order;
        out.sort((a, b) => (asc ? 1 : -1) * String(a[col]).localeCompare(String(b[col])));
      }
      if (st.limit !== undefined) out = out.slice(0, st.limit);
      return { data: single ? (out[0] ?? null) : out, error: null };
    };
    const b = {
      select(_cols: string) {
        if (st.op === "update") st.returning = true;
        return b;
      },
      update(patch: Row) { st.op = "update"; st.patch = patch; return b; },
      upsert(row: Row, opts: { ignoreDuplicates?: boolean }) { st.op = "upsert"; st.row = row; st.opts = opts; return b; },
      eq(c: string, v: unknown) { st.filters.push((r) => r[c] === v); return b; },
      neq(c: string, v: unknown) { st.filters.push((r) => r[c] !== v); return b; },
      in(c: string, vs: unknown[]) { st.filters.push((r) => vs.includes(r[c])); return b; },
      lt(c: string, v: number) { st.filters.push((r) => (r[c] as number) < v); return b; },
      order(c: string, o: { ascending: boolean }) { st.order = [c, o.ascending]; return b; },
      limit(n: number) { st.limit = n; return b; },
      maybeSingle: async () => run(true),
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(run(false)).then(resolve, reject);
      },
    };
    return b;
  }
  const client = { from: (_t: string) => builder() } as unknown as SupabaseClient;
  return { client, rows };
}

const RECIPIENT = { name: "A B", address1: "1 St", city: "Taipei", country_code: "TW", zip: "100" };
const PAYLOAD = { recipient: RECIPIENT, items: [{ sku: "S", quantity: 1 }] };
const T0 = Date.parse("2026-09-26T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const row = (over: Row = {}): Row => ({
  woo_order_id: "1001",
  organization_id: null,
  payload: PAYLOAD,
  status: "pending",
  reason: null,
  attempts: 0,
  created_at: iso(T0 - 60_000),
  updated_at: iso(T0 - 60_000),
  done_at: null,
  ...over,
});
const asRow = (r: Row) => r as unknown as import("../pod-order-inbox").PodOrderRow;
const draftOk = { ok: true, value: { printfulOrderId: 55, status: "draft", alreadyExisted: false } };

beforeEach(() => {
  checkProductionChangeAllowed.mockReset();
  checkProductionChangeAllowed.mockResolvedValue({ allowed: true, mode: "normal" });
  createDraftOrderOnNative.mockReset();
  createDraftOrderOnNative.mockResolvedValue(draftOk);
});

describe("recordPodOrder", () => {
  it("inserts a pending row, and a re-delivery never resets its status, attempts or payload", async () => {
    const db = makeFakeDb();
    const first = await inbox.recordPodOrder(db.client, "1001", null, PAYLOAD);
    expect(first).toMatchObject({ ok: true, row: { status: "pending", attempts: 0 } });
    Object.assign(db.rows[0], { status: "done", attempts: 1 });
    const again = await inbox.recordPodOrder(db.client, "1001", null, { ...PAYLOAD, items: [] });
    expect(again).toMatchObject({ ok: true, row: { status: "done", attempts: 1, payload: PAYLOAD } });
    expect(db.rows).toHaveLength(1);
  });

  it("an insert error is returned, never thrown", async () => {
    const db = makeFakeDb([], { upsert: "conn refused" });
    expect(await inbox.recordPodOrder(db.client, "1001", null, PAYLOAD)).toEqual({ ok: false, error: "conn refused" });
  });

  it("inserted but not read back: still ok (the order IS recorded), row null", async () => {
    const db = makeFakeDb([], { select: "timeout" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await inbox.recordPodOrder(db.client, "1001", null, PAYLOAD)).toEqual({ ok: true, row: null });
    expect(db.rows).toHaveLength(1);
  });
});

describe("processPodOrder", () => {
  it("allowed: claims (attempts 1), creates one draft, ends done", async () => {
    const db = makeFakeDb([row()]);
    const out = await inbox.processPodOrder(db.client, asRow(row()), T0);
    expect(out).toEqual({ kind: "done", printfulOrderId: 55, status: "draft", alreadyExisted: false });
    expect(createDraftOrderOnNative).toHaveBeenCalledTimes(1);
    expect(createDraftOrderOnNative).toHaveBeenCalledWith({ externalId: "1001", recipient: RECIPIENT, items: PAYLOAD.items });
    expect(db.rows[0]).toMatchObject({ status: "done", attempts: 1, reason: null });
    expect(db.rows[0].done_at).toBeTruthy();
  });

  it("blocked: deferred with the mode as reason, attempts unchanged, no Printful call", async () => {
    checkProductionChangeAllowed.mockResolvedValue({ allowed: false, mode: "emergency_stop" });
    const db = makeFakeDb([row()]);
    expect(await inbox.processPodOrder(db.client, asRow(row()), T0)).toEqual({ kind: "deferred", mode: "emergency_stop" });
    expect(db.rows[0]).toMatchObject({ status: "deferred", reason: "emergency_stop", attempts: 0 });
    expect(createDraftOrderOnNative).not.toHaveBeenCalled();
  });

  it("Printful failure: failed with the error, one attempt used", async () => {
    createDraftOrderOnNative.mockResolvedValue({ ok: false, error: "printful_502" });
    const db = makeFakeDb([row()]);
    expect(await inbox.processPodOrder(db.client, asRow(row()), T0)).toEqual({ kind: "failed", error: "printful_502", attempts: 1 });
    expect(db.rows[0]).toMatchObject({ status: "failed", reason: "printful_502", attempts: 1 });
  });

  it("two workers on the same row: exactly one Printful call, the other sees in_flight", async () => {
    let release!: () => void;
    createDraftOrderOnNative.mockImplementation(() => new Promise((r) => { release = () => r(draftOk); }));
    const db = makeFakeDb([row()]);
    const a = inbox.processPodOrder(db.client, asRow(row()), T0);
    const b = inbox.processPodOrder(db.client, asRow(row()), T0);
    await vi.waitFor(() => expect(createDraftOrderOnNative).toHaveBeenCalledTimes(1));
    release();
    const outcomes = (await Promise.all([a, b])).map((o) => o.kind).sort();
    expect(outcomes).toEqual(["done", "in_flight"]);
    expect(createDraftOrderOnNative).toHaveBeenCalledTimes(1);
  });

  it("done / cancelled -> already_done; attempts exhausted -> gave_up; none reads the gate or calls Printful", async () => {
    const db = makeFakeDb();
    expect(await inbox.processPodOrder(db.client, asRow(row({ status: "done" })), T0)).toEqual({ kind: "already_done" });
    expect(await inbox.processPodOrder(db.client, asRow(row({ status: "cancelled" })), T0)).toEqual({ kind: "already_done" });
    expect(await inbox.processPodOrder(db.client, asRow(row({ status: "failed", attempts: MAX_ATTEMPTS })), T0)).toEqual({ kind: "gave_up", attempts: MAX_ATTEMPTS });
    expect(checkProductionChangeAllowed).not.toHaveBeenCalled();
    expect(createDraftOrderOnNative).not.toHaveBeenCalled();
  });

  it("a failed row is retried only when due -- a Woo order.updated burst never burns attempts", async () => {
    const failed = row({ status: "failed", attempts: 2, updated_at: iso(T0 - RETRY_BASE_MS) });
    const db = makeFakeDb([failed]);
    expect(await inbox.processPodOrder(db.client, asRow(failed), T0)).toEqual({ kind: "retry_scheduled", attempts: 2 });
    expect(createDraftOrderOnNative).not.toHaveBeenCalled();
    expect((await inbox.processPodOrder(db.client, asRow(failed), T0 + RETRY_BASE_MS)).kind).toBe("done");
    expect(db.rows[0]).toMatchObject({ status: "done", attempts: 3 });
  });

  it("a claimed row is in_flight until STALE_PENDING_MS, then reclaimable", async () => {
    const claimed = row({ attempts: 1, updated_at: iso(T0 - 60_000) });
    const db = makeFakeDb([claimed]);
    expect(await inbox.processPodOrder(db.client, asRow(claimed), T0)).toEqual({ kind: "in_flight" });
    const later = T0 + STALE_PENDING_MS;
    expect((await inbox.processPodOrder(db.client, asRow(claimed), later)).kind).toBe("done");
    expect(db.rows[0]).toMatchObject({ status: "done", attempts: 2 });
  });
});

describe("isDrainable", () => {
  it("deferred always; failed after backoff 5/10/20 min; pending only when stale; never done or exhausted", () => {
    const at = (over: Row, ageMs: number) => inbox.isDrainable(asRow(row({ ...over, updated_at: iso(T0 - ageMs) })), T0);
    expect(at({ status: "deferred" }, 0)).toBe(true);
    expect(at({ status: "failed", attempts: 1 }, RETRY_BASE_MS - 1)).toBe(false);
    expect(at({ status: "failed", attempts: 1 }, RETRY_BASE_MS)).toBe(true);
    expect(at({ status: "failed", attempts: 2 }, RETRY_BASE_MS)).toBe(false);
    expect(at({ status: "failed", attempts: 3 }, 4 * RETRY_BASE_MS)).toBe(true);
    expect(at({ status: "pending" }, STALE_PENDING_MS - 1)).toBe(false);
    expect(at({ status: "pending" }, STALE_PENDING_MS)).toBe(true);
    expect(at({ status: "done" }, 10 * STALE_PENDING_MS)).toBe(false);
    expect(at({ status: "deferred", attempts: MAX_ATTEMPTS }, 0)).toBe(false);
  });
});

describe("drainPodOrderInbox", () => {
  it("replays drainable rows oldest first and skips the ones not due", async () => {
    const db = makeFakeDb([
      row({ woo_order_id: "2", status: "deferred", created_at: iso(T0 - 2000) }),
      row({ woo_order_id: "1", status: "deferred", created_at: iso(T0 - 3000) }),
      row({ woo_order_id: "3", status: "failed", attempts: 1, created_at: iso(T0 - 1000), updated_at: iso(T0 - 1000) }),
    ]);
    expect(await inbox.drainPodOrderInbox(db.client, T0)).toEqual({ processed: 2, blocked: false });
    expect(createDraftOrderOnNative.mock.calls.map((c) => (c[0] as { externalId: string }).externalId)).toEqual(["1", "2"]);
    expect(db.rows.find((r) => r.woo_order_id === "3")).toMatchObject({ status: "failed", attempts: 1 });
  });

  it("stops at the first deferral when the mode blocks", async () => {
    checkProductionChangeAllowed.mockResolvedValue({ allowed: false, mode: "maintenance" });
    const db = makeFakeDb([row({ woo_order_id: "1", status: "deferred" }), row({ woo_order_id: "2", status: "deferred", created_at: iso(T0) })]);
    expect(await inbox.drainPodOrderInbox(db.client, T0)).toEqual({ processed: 0, blocked: true });
    expect(checkProductionChangeAllowed).toHaveBeenCalledTimes(1);
  });

  it("a read error is returned, never thrown", async () => {
    const db = makeFakeDb([], { select: "boom" });
    expect(await inbox.drainPodOrderInbox(db.client, T0)).toEqual({ processed: 0, blocked: false, error: "boom" });
  });
});

describe("unfulfillable and manual paths", () => {
  it("recordUnfulfillablePodOrder keeps the order with no retries left; the manual pforder closes it", async () => {
    const db = makeFakeDb();
    expect(await inbox.recordUnfulfillablePodOrder(db.client, "9", "recipient_incomplete")).toEqual({ ok: true });
    expect(db.rows[0]).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS, reason: "unfulfillable:recipient_incomplete" });
    expect(inbox.isDrainable(asRow(db.rows[0]), T0 + 10 * STALE_PENDING_MS)).toBe(false);
    await inbox.markPodOrderDoneIfPresent(db.client, "9");
    expect(db.rows[0]).toMatchObject({ status: "done", reason: "manual_pforder" });
  });

  it("cancelPodOrderIfOpen closes waiting and unclaimed rows, never an in-flight claim or a done row", async () => {
    const db = makeFakeDb([
      row({ woo_order_id: "d", status: "deferred" }),
      row({ woo_order_id: "f", status: "failed", attempts: MAX_ATTEMPTS }),
      row({ woo_order_id: "p0", status: "pending", attempts: 0 }),
      row({ woo_order_id: "p1", status: "pending", attempts: 1 }),
      row({ woo_order_id: "x", status: "done" }),
    ]);
    for (const id of ["d", "f", "p0", "p1", "x"]) await inbox.cancelPodOrderIfOpen(db.client, id, "refunded");
    expect(Object.fromEntries(db.rows.map((r) => [r.woo_order_id, r.status]))).toEqual({ d: "cancelled", f: "cancelled", p0: "cancelled", p1: "pending", x: "done" });
    expect(db.rows[0].reason).toBe("woo_refunded");
    expect(inbox.isDrainable(asRow(db.rows[0]), T0)).toBe(false);
  });

  it("markPodOrderDoneIfPresent never rewrites a done row", async () => {
    const db = makeFakeDb([row({ status: "done", reason: null, done_at: "keep" })]);
    await inbox.markPodOrderDoneIfPresent(db.client, "1001");
    expect(db.rows[0]).toMatchObject({ reason: null, done_at: "keep" });
  });
});

describe("getPodOrderInboxStats", () => {
  it("buckets open rows; overdue = a due retry nobody ran for OVERDUE_MARGIN_MS; stuck = stale past the margin", async () => {
    const db = makeFakeDb([
      row({ woo_order_id: "a", status: "deferred", created_at: iso(T0 - 7200_000) }),
      row({ woo_order_id: "b", status: "failed", attempts: 2, updated_at: iso(T0 - 60_000) }),
      row({ woo_order_id: "b2", status: "failed", attempts: 1, updated_at: iso(T0 - RETRY_BASE_MS - OVERDUE_MARGIN_MS) }),
      row({ woo_order_id: "c", status: "failed", attempts: MAX_ATTEMPTS }),
      row({ woo_order_id: "d", status: "pending", attempts: 1, updated_at: iso(T0 - STALE_PENDING_MS - OVERDUE_MARGIN_MS) }),
      row({ woo_order_id: "d2", status: "pending", attempts: 1, updated_at: iso(T0 - STALE_PENDING_MS) }),
      row({ woo_order_id: "e", status: "done" }),
      row({ woo_order_id: "g", status: "cancelled" }),
    ]);
    expect(await inbox.getPodOrderInboxStats(db.client, T0)).toEqual({
      ok: true, deferred: 1, oldestDeferredAgeSeconds: 7200, retrying: 2, overdueRetries: 1, gaveUp: 1, stuckPending: 1, capped: false,
    });
  });

  it("an unreadable table is ok:false, never a row of zeros", async () => {
    const db = makeFakeDb([], { select: "permission denied" });
    expect(await inbox.getPodOrderInboxStats(db.client, T0)).toMatchObject({ ok: false, error: "permission denied" });
  });
});
