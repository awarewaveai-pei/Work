import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createEntitlementStore } from "../tables";

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: mocks.client }));
import { POST } from "@/app/api/internal/entitlements/expire/route";

function database(result: object) {
  const query = { update: vi.fn(), in: vi.fn(), lte: vi.fn() };
  query.update.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.lte.mockResolvedValue(result);
  const db = { from: vi.fn(() => query), rpc: vi.fn() };
  return { db, query, client: db as unknown as SupabaseClient };
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
    expect(await (await POST(request())).json()).toEqual({ ok: true, expired: 1501 });
    mocks.client.mockReturnValue(database({ error: { message: "unavailable" }, count: null }).client);
    expect((await POST(request())).status).toBe(500);
    mocks.client.mockReturnValue(database({ error: null, count: null }).client);
    expect((await POST(request())).status).toBe(500);
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
});
