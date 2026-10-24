import { describe, expect, it, vi } from "vitest";
import { verifyPermit } from "../can";
import { issueForService } from "../issuer";
import type { SubjectStore } from "../subject";
import { CUSTOMER, gateFixture } from "./gate-fixtures";

const root: SubjectStore = {
  byId: async (id) => (id === CUSTOMER.orgId ? { id, parent_organization_id: null, kind: "customer" } : id === "child" ? { id, parent_organization_id: CUSTOMER.orgId, kind: "customer" } : null),
  bySlug: async () => null, internal: async () => null,
};
const ask = (body: Record<string, unknown>) => ({ organization_id: CUSTOMER.orgId, feature_key: "architecture.adr", actor: "cognitive:person-1", ...body });

describe("permit issuer for the cognitive service (ADR 017 §3)", () => {
  it("issues a permit bound to the billing account, feature and actor when an entitlement row is active", async () => {
    const { deps } = gateFixture({ entitlement: { productKey: "cognitive", featureKey: "architecture.adr" } });
    const answer = await issueForService("cognitive", ask({}), deps, root);
    expect(answer.status).toBe(200);
    if (!answer.body.allowed) throw new Error("refused");
    const binding = { tenant: CUSTOMER.orgId, product_key: "cognitive", feature_key: "architecture.adr", actor: "cognitive:person-1", on_behalf_of: CUSTOMER.orgId };
    expect(verifyPermit(answer.body.permit, deps.publicKeys(), binding)).toMatchObject({ entitlement_id: "ent-1" });
  });

  it("no active entitlement means allowed=false with reason no_entitlement, and credits follow the wallet", async () => {
    expect((await issueForService("cognitive", ask({}), gateFixture({ entitlement: null }).deps, root)).body).toEqual({ allowed: false, reason: "no_entitlement" });
    expect((await issueForService("cognitive", ask({ feature_key: "ai.draft_record" }), gateFixture({ credits: true, balance: 0 }).deps, root)).body).toEqual({ allowed: false, reason: "no_credits" });
    expect((await issueForService("cognitive", ask({ feature_key: "ai.draft_record" }), gateFixture({ credits: true, balance: 5 }).deps, root)).body.allowed).toBe(true);
  });

  it("the cognitive token cannot mint another product's feature, a foreign actor form, or a child org", async () => {
    const { deps } = gateFixture();
    expect((await issueForService("cognitive", ask({ feature_key: "social.dispatch" }), deps, root)).body).toEqual({ allowed: false, reason: "feature_outside_product" });
    expect((await issueForService("cognitive", ask({ actor: "ops:owner:u" }), deps, root)).body).toEqual({ allowed: false, reason: "actor_outside_product" });
    expect((await issueForService("cognitive", ask({ organization_id: "child" }), deps, root)).body).toEqual({ allowed: false, reason: "not_billing_account" });
    expect((await issueForService("cognitive", ask({ organization_id: "nope" }), deps, root)).status).toBe(404);
    expect((await issueForService("cognitive", { feature_key: 1 }, deps, root)).status).toBe(400);
  });

  it("an infrastructure error answers 503 infrastructure_error, never a permit", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const answer = await issueForService("cognitive", ask({}), gateFixture({ storeError: new Error("db down"), entitlement: { productKey: "cognitive" } }).deps, root);
    expect(answer).toEqual({ status: 503, body: { allowed: false, reason: "infrastructure_error" } });
  });
});
