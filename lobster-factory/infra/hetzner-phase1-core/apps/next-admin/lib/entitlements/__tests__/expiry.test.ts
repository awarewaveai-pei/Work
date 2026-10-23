import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PRODUCTS } from "@/lib/portal/products";
import { createEntitlementStore } from "../tables";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../../../../packages/db/migrations");

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: mocks.client }));
import { POST } from "@/app/api/internal/entitlements/expire/route";

function database(result: object) {
  const query = { update: vi.fn(), in: vi.fn(), lte: vi.fn() };
  query.update.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.lte.mockResolvedValue(result);
  // endLapsedTrials' first page read: no lapsed trials.
  const trials = { select: vi.fn(), eq: vi.fn(), lte: vi.fn(), gt: vi.fn(), order: vi.fn(), limit: vi.fn() };
  for (const step of ["select", "eq", "lte", "gt", "order"] as const) trials[step].mockReturnValue(trials);
  trials.limit.mockResolvedValue({ data: [], error: null });
  const db = { from: vi.fn((table: string) => (table === "organization_product_subscriptions" ? trials : query)), rpc: vi.fn().mockResolvedValue({ data: 0, error: null }) };
  return { db, query, client: db as unknown as SupabaseClient };
}

// Thenable chain per table: every filter call is recorded, awaiting it pops the next result.
function trialDb(results: Record<string, object[]>) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = [];
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const op of ["select", "update", "eq", "in", "lte", "gt", "order", "limit"]) {
      chain[op] = (...args: unknown[]) => { calls.push({ table, op, args }); return chain; };
    }
    chain.then = (ok: (value: object) => unknown, fail: (error: unknown) => unknown) => {
      const next = results[table].shift();
      return next ? Promise.resolve(next).then(ok) : Promise.reject(new Error(`unexpected ${table} query`)).then(ok, fail);
    };
    return chain;
  });
  return { calls, client: { from } as unknown as SupabaseClient };
}

describe("global entitlement expiry", () => {
  beforeEach(() => { vi.stubEnv("SCHEDULE_INGEST_TOKEN", "expiry-test-token"); });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("updates all elapsed active/suspended rows in one unpaginated query", async () => {
    const { db, query, client } = database({ error: null, count: 1501 });
    const now = new Date("2026-10-19T01:00:00Z");
    expect(await createEntitlementStore(client).expireEntitlements(now)).toBe(1501);
    expect(db.from).toHaveBeenCalledWith("organization_entitlements");
    expect(query.update).toHaveBeenCalledWith({ status: "expired" }, { count: "exact" });
    expect(query.in).toHaveBeenCalledWith("status", ["active", "suspended"]);
    expect(query.lte).toHaveBeenCalledWith("ends_at", now.toISOString());
  });

  it("requires the dedicated token and fails closed if unset", async () => {
    mocks.client.mockClear();
    for (const token of [undefined, "wrong-token"]) {
      const request = new Request("http://localhost/api/internal/entitlements/expire", {
        method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      expect((await POST(request)).status).toBe(401);
    }
    vi.stubEnv("SCHEDULE_INGEST_TOKEN", "");
    expect((await POST(new Request("http://localhost", { method: "POST", headers: { Authorization: "Bearer expiry-test-token" } }))).status).toBe(401);
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("returns the whole sweep count; DB failure cannot look like success", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const request = () => new Request("http://localhost/api/internal/entitlements/expire", {
      method: "POST", headers: { Authorization: "Bearer expiry-test-token" },
    });
    mocks.client.mockReturnValue(database({ error: null, count: 1501 }).client);
    expect(await (await POST(request())).json()).toEqual({ ok: true, expired: 1501, trials_ended: 0, internal_comp_added: 0 });
    mocks.client.mockReturnValue(database({ error: { message: "unavailable" }, count: null }).client);
    expect((await POST(request())).status).toBe(500);
    mocks.client.mockReturnValue(database({ error: null, count: null }).client);
    expect((await POST(request())).status).toBe(500);
  });

  it("ends only trials whose own contract grants are all gone, and only while still trial", async () => {
    const now = new Date("2026-10-21T00:00:00Z");
    const { calls, client } = trialDb({
      organization_product_subscriptions: [{ data: [{ id: "a" }, { id: "b" }], error: null }, { error: null, count: 1 }],
      organization_entitlements: [{ data: [{ id: "g1", source_ref: "a" }], error: null }],
    });
    expect(await createEntitlementStore(client).endLapsedTrials(now)).toBe(1);
    const read = calls.filter((c) => c.table === "organization_product_subscriptions").slice(0, 6);
    expect(read).toEqual([
      { table: "organization_product_subscriptions", op: "select", args: ["id"] },
      { table: "organization_product_subscriptions", op: "eq", args: ["status", "trial"] },
      { table: "organization_product_subscriptions", op: "lte", args: ["current_period_end", now.toISOString()] },
      { table: "organization_product_subscriptions", op: "gt", args: ["id", "00000000-0000-0000-0000-000000000000"] },
      { table: "organization_product_subscriptions", op: "order", args: ["id"] },
      { table: "organization_product_subscriptions", op: "limit", args: [200] },
    ]);
    expect(calls.filter((c) => c.table === "organization_entitlements")).toEqual([
      { table: "organization_entitlements", op: "select", args: ["id, source_ref"] },
      { table: "organization_entitlements", op: "eq", args: ["source", "contract"] },
      { table: "organization_entitlements", op: "in", args: ["source_ref", ["a", "b"]] },
      { table: "organization_entitlements", op: "in", args: ["status", ["active", "suspended"]] },
      { table: "organization_entitlements", op: "gt", args: ["id", "00000000-0000-0000-0000-000000000000"] },
      { table: "organization_entitlements", op: "order", args: ["id"] },
      { table: "organization_entitlements", op: "limit", args: [500] },
    ]);
    expect(calls.filter((c) => c.table === "organization_product_subscriptions").slice(6)).toEqual([
      { table: "organization_product_subscriptions", op: "update", args: [{ status: "canceled", updated_at: now.toISOString() }, { count: "exact" }] },
      { table: "organization_product_subscriptions", op: "in", args: ["id", ["b"]] },
      { table: "organization_product_subscriptions", op: "eq", args: ["status", "trial"] },
    ]);
  });

  it("reads live grants past a full grant page, so a trial in grace is never canceled by truncation", async () => {
    const manyForA = Array.from({ length: 500 }, (_, i) => ({ id: `g-${String(i).padStart(3, "0")}`, source_ref: "a" }));
    const { calls, client } = trialDb({
      organization_product_subscriptions: [{ data: [{ id: "a" }, { id: "b" }], error: null }],
      organization_entitlements: [{ data: manyForA, error: null }, { data: [{ id: "g-500", source_ref: "b" }], error: null }],
    });
    expect(await createEntitlementStore(client).endLapsedTrials()).toBe(0);
    expect(calls.filter((c) => c.table === "organization_entitlements" && c.op === "gt").map((c) => c.args[1]))
      .toEqual(["00000000-0000-0000-0000-000000000000", "g-499"]);
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });

  it("pages by id past a full page and fails loudly on a write error", async () => {
    const full = Array.from({ length: 200 }, (_, i) => ({ id: `id-${String(i).padStart(3, "0")}` }));
    const paged = trialDb({
      organization_product_subscriptions: [{ data: full, error: null }, { data: [], error: null }],
      organization_entitlements: [{ data: full.map((r) => ({ id: `g-${r.id}`, source_ref: r.id })), error: null }],
    });
    expect(await createEntitlementStore(paged.client).endLapsedTrials()).toBe(0);
    expect(paged.calls.filter((c) => c.table === "organization_product_subscriptions" && c.op === "gt").map((c) => c.args[1])).toEqual(["00000000-0000-0000-0000-000000000000", "id-199"]);
    expect(paged.calls.some((c) => c.op === "update")).toBe(false);

    const failing = trialDb({
      organization_product_subscriptions: [{ data: [{ id: "a" }], error: null }, { error: { message: "write denied" }, count: null }],
      organization_entitlements: [{ data: [], error: null }],
    });
    await expect(createEntitlementStore(failing.client).endLapsedTrials()).rejects.toThrow("write denied");
  });

  it("uses the aggregate balance RPC and refuses invalid balances", async () => {
    const { db, client } = database({});
    db.rpc.mockResolvedValue({ data: "1501.5", error: null });
    expect(await createEntitlementStore(client).getCreditBalance("org-1")).toBe(1501.5);
    expect(db.rpc).toHaveBeenCalledWith("entitlement_credit_balance", { p_organization_id: "org-1" });
    expect(db.from).not.toHaveBeenCalled();
    db.rpc.mockResolvedValue({ data: null, error: { message: "db error" } });
    await expect(createEntitlementStore(client).getCreditBalance("org-1")).rejects.toThrow("db error");
    db.rpc.mockResolvedValue({ data: "not a number", error: null });
    await expect(createEntitlementStore(client).getCreditBalance("org-1")).rejects.toThrow("invalid_credit_balance");
  });

  it("tops up the internal account's comp grants from every registered feature", async () => {
    const { db, client } = database({});
    db.rpc.mockResolvedValue({ data: 3, error: null });
    expect(await createEntitlementStore(client).ensureInternalComp()).toBe(3);
    const sent = db.rpc.mock.calls[0][1].p_features as Array<{ product_key: string; feature_key: string }>;
    expect(db.rpc.mock.calls[0][0]).toBe("entitlement_ensure_internal_comp");
    expect(sent).toEqual(PRODUCTS.flatMap((p) => p.features.map((f) => ({ product_key: p.key, feature_key: f.feature_key }))));
    expect(sent.length).toBeGreaterThan(0);
    db.rpc.mockResolvedValue({ data: null, error: { message: "internal organization not found" } });
    await expect(createEntitlementStore(client).ensureInternalComp()).rejects.toThrow("internal organization not found");
  });

  it("every registered product is a product_key 0110 accepts, so the daily top-up cannot fail on a new product", () => {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, "0110_plans_entitlements.sql"), "utf8");
    const lists = [...sql.matchAll(/product_key in \(([^)]*)\)/g)].map((m) => new Set(m[1].match(/'([^']+)'/g)!.map((q) => q.slice(1, -1))));
    expect(lists.length).toBe(3);   // plans, organization_entitlements, organization_product_subscriptions: each must accept every product
    for (const allowed of lists) expect(PRODUCTS.map((p) => p.key).filter((k) => !allowed.has(k))).toEqual([]);
  });
});
