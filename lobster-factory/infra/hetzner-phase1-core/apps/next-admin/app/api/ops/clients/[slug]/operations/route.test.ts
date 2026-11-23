// POST /api/ops/clients/[slug]/operations -- the named cases: a client identity is refused 403 (staffOnly) and writes
// nothing; a staff member who may not write tenant config is refused 403; staff owner/admin writes on the billing
// (root) account; an internal account is refused.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = "00000000-0000-4000-8000-0000000000d1";
const state = vi.hoisted(() => ({ subject: null as null | { orgId: string; kind: string } }));
const set = vi.hoisted(() => vi.fn(async (_c: Record<string, unknown>) => "set"));
const audit = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/ops-audit", () => ({ recordOpsAudit: audit }));
vi.mock("@/lib/entitlements/operations", async (orig) => ({ ...(await orig<typeof import("@/lib/entitlements/operations")>()), setProductOperator: set }));
vi.mock("@/lib/entitlements/subject", async (orig) => ({
  ...(await orig<typeof import("@/lib/entitlements/subject")>()),
  resolveSubject: async () => { if (!state.subject) throw new Error("subject_not_found"); return state.subject; },
}));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ slug: "soulful-brand" }) };
const post = (headers: Record<string, string>, body: unknown = { product: "content", operatedBy: "awarewave" }) =>
  new Request("http://localhost/api/ops/clients/soulful-brand/operations", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });
const staff = (role: string) => ({ "x-ops-user-kind": "staff", "x-ops-claims-role": role, "x-ops-user-id": "u1" });

beforeEach(() => {
  set.mockClear();
  audit.mockClear();
  state.subject = { orgId: ROOT, kind: "customer" };
});

describe("POST operations", () => {
  it("a client identity bound to this very account is refused 403 by staffOnly and writes nothing", async () => {
    const res = await POST(post({ "x-ops-user-kind": "client", "x-ops-org-id": ROOT }), ctx);
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).toContain("staff only");
    expect(set).not.toHaveBeenCalled();
  });

  it("staff who may not write tenant config (viewer, operator) are refused 403", async () => {
    for (const role of ["viewer", "operator"]) {
      const res = await POST(post(staff(role)), ctx);
      expect(res.status).toBe(403);
    }
    expect(set).not.toHaveBeenCalled();
  });

  it("staff admin switches the product on the root account the brand resolves to, and it is audited", async () => {
    const res = await POST(post(staff("admin")), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, product: "content", operatedBy: "awarewave" });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ accountId: ROOT, productKey: "content", operatedBy: "awarewave", actor: "ops:admin:u1" }));
    expect(audit).toHaveBeenCalledWith(ROOT, "admin", "claims", "client_product_operator_set", expect.objectContaining({ product: "content", operated_by: "awarewave" }));
  });

  it("a bad body is 400, an internal account 409, an unknown client 404 -- none writes", async () => {
    expect((await POST(post(staff("owner"), { product: "content", operatedBy: "reseller" }), ctx)).status).toBe(400);
    expect((await POST(post(staff("owner"), { product: "nope", operatedBy: "awarewave" }), ctx)).status).toBe(400);
    state.subject = { orgId: ROOT, kind: "internal" };
    expect((await POST(post(staff("owner")), ctx)).status).toBe(409);
    state.subject = null;
    expect((await POST(post(staff("owner")), ctx)).status).toBe(404);
    expect(set).not.toHaveBeenCalled();
  });
});
