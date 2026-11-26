import { beforeEach, describe, expect, it, vi } from "vitest";

// The client-invite functions stand in with the one rule this route relies on: an account is found only within the
// unit passed in (client-invite.ts belongsTo). ACCOUNTS = userId -> its unit.
const ORG = "00000000-0000-4000-8000-0000000000c1";
const OTHER_ORG = "00000000-0000-4000-8000-0000000000c2";
const MANAGER = "00000000-0000-4000-8000-0000000000d1";
const COLLEAGUE = "00000000-0000-4000-8000-0000000000d2";
const STRANGER = "00000000-0000-4000-8000-0000000000d3";   // another unit's client
const h = vi.hoisted(() => ({
  accounts: new Map<string, string>(),
  invites: [] as Array<{ orgId: string; email: string; productKey: string }>,
  audits: [] as Array<[string, string, Record<string, unknown>]>,
  manager: "",
}));
vi.mock("@/lib/accounts/client-invite", async (orig) => ({
  ...(await orig<object>()),
  listClientAccounts: vi.fn(async (_db: unknown, orgId: string) => [...h.accounts].filter(([, o]) => o === orgId)
    .map(([userId]) => ({ userId, email: `${userId.slice(-2)}@unit.test`, verified: true, createdAt: null, lastSignInAt: null }))),
  inviteClientAccount: vi.fn(async (_db: unknown, a: { orgId: string; email: string; productKey: string }) => {
    h.invites.push({ orgId: a.orgId, email: a.email, productKey: a.productKey });
    return { ok: true, userId: COLLEAGUE, kind: "recovery", created: false };
  }),
  deleteClientAccount: vi.fn(async (_db: unknown, orgId: string, userId: string) => {
    if (h.accounts.get(userId) !== orgId) return { ok: false, status: 404, error: "account_not_found" };
    h.accounts.delete(userId);
    return { ok: true, email: "x" };
  }),
}));
vi.mock("@/lib/entitlements/identities", () => ({
  isAccountManager: vi.fn(async (_db: unknown, orgId: string, userId: string) => orgId === ORG && userId === h.manager),
}));
vi.mock("@/lib/portal/held-doors", () => ({ heldDoors: vi.fn(async () => [{ key: "content", name: "內容行銷" }]) }));
vi.mock("@/lib/ops-audit", () => ({
  recordOpsAudit: vi.fn(async (org: string, _role: string, _src: string, event: string, payload: Record<string, unknown>) => { h.audits.push([org, event, payload]); }),
}));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: "Unit" }, error: null }) }) }) }) }),
}));

import { DELETE, GET, POST } from "../route";

const as = (userId: string) => ({ "x-ops-user-kind": "client", "x-ops-org-id": ORG, "x-ops-user-id": userId });
const URL_ = "https://portal.aware-wave.com/portal/api/people";
const post = (who: string, body: Record<string, unknown>, qs = "") =>
  POST(new Request(`${URL_}${qs}`, { method: "POST", headers: { ...as(who), "content-type": "application/json" }, body: JSON.stringify(body) }));
const del = (who: string, userId: string, qs = "") => DELETE(new Request(`${URL_}?userId=${userId}${qs}`, { method: "DELETE", headers: as(who) }));

describe("/portal/api/people (U19)", () => {
  beforeEach(() => {
    h.accounts = new Map([[MANAGER, ORG], [COLLEAGUE, ORG], [STRANGER, OTHER_ORG]]);
    h.invites = [];
    h.audits = [];
    h.manager = MANAGER;
  });

  it("the manager invites, resends and removes; each action is audited with the client as the actor", async () => {
    const list = await (await GET(new Request(URL_, { headers: as(MANAGER) }))).json();
    expect(list.role).toBe("manager");
    expect(list.accounts.map((a: { userId: string; self: boolean }) => [a.userId, a.self])).toEqual([[MANAGER, true], [COLLEAGUE, false]]);
    expect((await post(MANAGER, { email: "New@Unit.test", product: "content" })).status).toBe(200);
    expect((await post(MANAGER, { email: "d2@unit.test", product: "content" })).status).toBe(200);   // 重寄
    expect(h.invites).toEqual([{ orgId: ORG, email: "new@unit.test", productKey: "content" }, { orgId: ORG, email: "d2@unit.test", productKey: "content" }]);
    expect((await del(MANAGER, COLLEAGUE)).status).toBe(200);
    expect(h.accounts.has(COLLEAGUE)).toBe(false);
    expect(h.audits.map(([org, event, p]) => [org, event, p.actor_user_id, p.actor_kind])).toEqual([
      [ORG, "client_account_link_sent", MANAGER, "client"], [ORG, "client_account_link_sent", MANAGER, "client"],
      [ORG, "client_account_deleted", MANAGER, "client"]]);
  });

  it("an authorized person: the page data is the role only, and every action is 403 with nothing done", async () => {
    expect(await (await GET(new Request(URL_, { headers: as(COLLEAGUE) }))).json()).toEqual({ ok: true, role: "member" });
    expect((await post(COLLEAGUE, { email: "x@unit.test", product: "content" })).status).toBe(403);
    expect((await post(COLLEAGUE, { email: "d1@unit.test", product: "content" })).status).toBe(403);
    expect((await del(COLLEAGUE, MANAGER)).status).toBe(403);
    expect(h.invites).toEqual([]);
    expect(h.accounts.size).toBe(3);
    expect(h.audits).toEqual([]);
  });

  it("another unit named in the query or body, or another unit's user: 404 for the delete and nothing touched there", async () => {
    expect((await del(MANAGER, STRANGER, `&org=${OTHER_ORG}&organizationId=${OTHER_ORG}`)).status).toBe(404);
    expect(h.accounts.get(STRANGER)).toBe(OTHER_ORG);
    await post(MANAGER, { email: "y@unit.test", product: "content", org: OTHER_ORG, organizationId: OTHER_ORG }, `?org=${OTHER_ORG}`);
    expect(h.invites.map((i) => i.orgId)).toEqual([ORG]);
    expect(h.audits.every(([org]) => org === ORG)).toBe(true);
  });

  it("the manager cannot delete themself", async () => {
    expect(await (await del(MANAGER, MANAGER)).json()).toEqual({ ok: false, error: "cannot_delete_self" });
    expect(h.accounts.has(MANAGER)).toBe(true);
  });
});
