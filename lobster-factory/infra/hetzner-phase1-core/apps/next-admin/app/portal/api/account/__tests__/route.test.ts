import { beforeEach, describe, expect, it, vi } from "vitest";

const billing = vi.hoisted(() => vi.fn());
const manager = vi.hoisted(() => vi.fn());
vi.mock("@/lib/entitlements/tables", () => ({ billingAccount: billing }));
vi.mock("@/lib/entitlements/account-manager", () => ({ isAccountManager: manager }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({}) }));

import { GET } from "../route";

const ACCOUNT = {
  organization_id: "org-1", name: "n", slug: "s", kind: "customer", all_features: { source: "x", source_ref: "secret", note: null },
  balance: 42, hold: { reason: "chargeback", since: "2026-11-01" },
  contracts: [{ id: "c1", product_key: "content", plan_key: "p", status: "active", started_at: "a", current_period_end: "2026-12-31", source_ref: "woo-9" }],
  grants: [{ product_key: "content", source: "contract", source_ref: "woo-9", state: "active", features: 13, ends_at: null }],
  expired_grants: 0,
  ledger: [{ at: "2026-11-20", units: -5, entry_type: "debit", reference_type: "x", reference_id: "r1" }],
  payments: [{ at: "t", provider: "stripe", event_id: "evt_1", kind: "k", result: null }],
};
const CLIENT = { "x-ops-user-kind": "client", "x-ops-org-id": "org-1", "x-ops-user-id": "user-1" };
const get = (headers: Record<string, string> = CLIENT, qs = "") => GET(new Request(`https://portal.aware-wave.com/portal/api/account${qs}`, { headers }));

describe("GET /portal/api/account", () => {
  beforeEach(() => { billing.mockReset().mockResolvedValue(ACCOUNT); manager.mockReset().mockResolvedValue(true); });

  it("reads only the caller's own unit, ignoring any organization named in the query", async () => {
    await get(CLIENT, "?organizationId=org-2&org=org-2&organization_id=org-2");
    expect(billing).toHaveBeenCalledTimes(1);
    expect(billing).toHaveBeenCalledWith("org-1");
  });

  it("no identity headers: 401; staff or an org-less client: 403; nothing is read", async () => {
    expect((await get({})).status).toBe(401);
    expect((await get({ "x-ops-user-kind": "staff" })).status).toBe(403);
    expect((await get({ "x-ops-user-kind": "client" })).status).toBe(403);
    expect(billing).not.toHaveBeenCalled();
  });

  it("manager: exactly the §15.4 subset, no payments / provider / refs / hold reason", async () => {
    const body = await (await get()).json();
    expect(Object.keys(body).sort()).toEqual(["balance", "contracts", "frozen", "grants", "ledger", "next_period_end", "ok", "role"]);
    expect(body).toMatchObject({ role: "manager", balance: 42, frozen: true, next_period_end: "2026-12-31" });
    expect(Object.keys(body.contracts[0]).sort()).toEqual(["current_period_end", "plan_key", "product_key", "status"]);
    expect(Object.keys(body.ledger[0]).sort()).toEqual(["at", "entry_type", "units"]);
    expect(JSON.stringify(body)).not.toMatch(/stripe|evt_1|woo-9|secret|chargeback|r1/);
    expect(manager).toHaveBeenCalledWith(expect.anything(), "org-1", "user-1");
  });

  it("authorized member: balance and end date only", async () => {
    manager.mockResolvedValue(false);
    const body = await (await get()).json();
    expect(Object.keys(body).sort()).toEqual(["balance", "frozen", "next_period_end", "ok", "role"]);
    expect(body.role).toBe("member");
  });

  it("a failing read answers 503; no user id reads as member (shows less)", async () => {
    manager.mockRejectedValue(new Error("db"));
    expect((await get()).status).toBe(503);
    manager.mockResolvedValue(true);
    const { "x-ops-user-id": _u, ...noUser } = CLIENT;
    expect((await (await get(noUser)).json()).role).toBe("member");
  });
});
