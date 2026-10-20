import { afterEach, describe, expect, it, vi } from "vitest";
import { can, entitlementMode } from "../can";
import { grantFor, withFeature } from "../grant";
import { resolveSubject, type OrgRow, type SubjectStore } from "../subject";
import { CUSTOMER, INTERNAL, gateFixture } from "./gate-fixtures";

afterEach(() => vi.restoreAllMocks());
const ACTOR = "ops:operator:staff-1";

describe("can() — enforce", () => {
  it("no active entitlement means allowed=false with reason no_entitlement", async () => {
    const { deps } = gateFixture({ entitlement: null });
    const grant = await can(CUSTOMER, "social.dispatch", ACTOR, deps);
    expect(grant.allowed).toBe(false);
    expect(grant.reason).toBe("no_entitlement");
  });

  it("an active contract entitlement is allowed and carries its limits", async () => {
    const { deps } = gateFixture({ entitlement: { limits: { posts: 5 } } });
    const grant = await can(CUSTOMER, "social.dispatch", ACTOR, deps);
    expect(grant).toMatchObject({ allowed: true, shadow: false, limits: { posts: 5 } });
    expect(grant.info.entitlementId).toBe("ent-1");
  });

  it("a credits feature is allowed by wallet balance without an entitlement row and refused at zero balance", async () => {
    const funded = gateFixture({ entitlement: null, balance: 50 });
    expect((await can(CUSTOMER, "social.rewrite", ACTOR, funded.deps)).allowed).toBe(true);
    expect(funded.findActiveEntitlement).not.toHaveBeenCalled();
    const empty = gateFixture({ entitlement: null, balance: 0 });
    const refused = await can(CUSTOMER, "social.rewrite", ACTOR, empty.deps);
    expect(refused).toMatchObject({ allowed: false, reason: "no_credits" });
  });

  it("a credits permit carries source=credits, no entitlement_id and max_spend = min(balance, cap)", async () => {
    const small = await can(CUSTOMER, "social.rewrite", ACTOR, gateFixture({ balance: 40 }).deps);
    expect(small.info).toMatchObject({ source: "credits", entitlementId: null, maxSpend: 40 });
    const big = await can(CUSTOMER, "social.rewrite", ACTOR, gateFixture({ balance: 5000 }).deps);
    expect(big.maxSpend).toBe(100);
  });

  it("a staff actor acting for a customer org debits that org and the audit row names the staff user", async () => {
    const { deps, debit, audit } = gateFixture({ balance: 50 });
    const grant = await can(CUSTOMER, "social.rewrite", ACTOR, deps);
    await grant.report({ units: 3, idempotencyKey: "idem-key-0001" });
    expect(debit).toHaveBeenCalledWith({ orgId: CUSTOMER.orgId, units: 3, idempotencyKey: "idem-key-0001", featureKey: "social.rewrite" });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ event: "entitlement.usage", actor: ACTOR, subject: CUSTOMER }));
  });

  it("a grant cannot be edited into an allowed one at runtime, nor retargeted to another org", async () => {
    const denied = await can(CUSTOMER, "social.dispatch", ACTOR, gateFixture({ entitlement: null }).deps);
    expect(() => { (denied as never as { info: { allowed: boolean } }).info.allowed = true; }).toThrow(TypeError);
    expect(denied.allowed).toBe(false);
    const { deps, debit } = gateFixture({ balance: 50 });
    const grant = await can(CUSTOMER, "social.rewrite", ACTOR, deps);
    expect(() => { (grant.subject as { orgId: string }).orgId = "victim"; }).toThrow(TypeError);
    expect(Object.isFrozen(CUSTOMER)).toBe(false);   // the caller's own object is untouched
    await grant.report({ units: 1, idempotencyKey: "idem-key-0004" });
    expect(debit).toHaveBeenCalledWith(expect.objectContaining({ orgId: CUSTOMER.orgId }));
  });

  it("shadow never debits, even when the verdict allows", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deps, debit } = gateFixture({ mode: "shadow", balance: 50 });
    const grant = await can(CUSTOMER, "social.rewrite", ACTOR, deps);
    expect(grant.allowed).toBe(true);
    await grant.report({ units: 3, idempotencyKey: "idem-key-0005" });
    expect(debit).not.toHaveBeenCalled();
  });

  it("a debit needs the caller's idempotency key, and an audit failure after a debit does not throw", async () => {
    const { deps, debit, audit } = gateFixture({ balance: 50 });
    const grant = await can(CUSTOMER, "social.rewrite", ACTOR, deps);
    await expect(grant.report({ units: 1 })).rejects.toThrow("idempotency_key_required");
    expect(debit).not.toHaveBeenCalled();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    audit.mockRejectedValue(new Error("db down"));
    await expect(grant.report({ units: 1, idempotencyKey: "idem-key-0003" })).resolves.toBeUndefined();
    expect(debit).toHaveBeenCalledTimes(1);
  });

  it("refuses spend above max_spend and an unfunded debit", async () => {
    const grant = await can(CUSTOMER, "social.rewrite", ACTOR, gateFixture({ balance: 10 }).deps);
    await expect(grant.report({ units: 11 })).rejects.toThrow("exceeds_max_spend");
    const broke = await can(CUSTOMER, "social.rewrite", ACTOR, gateFixture({ balance: 10, debitAllowed: false }).deps);
    await expect(broke.report({ units: 1, idempotencyKey: "idem-key-0002" })).rejects.toThrow("no_credits");
  });

  it("an infrastructure error refuses the call", async () => {
    const { deps } = gateFixture({ storeError: new Error('relation "organization_entitlements" does not exist') });
    expect(await can(CUSTOMER, "social.dispatch", ACTOR, deps)).toMatchObject({ allowed: false, reason: "infrastructure_error" });
  });

  it("back-office features are for the internal account only", async () => {
    const { deps } = gateFixture();
    expect((await can(INTERNAL, "ops.inbox-ai", "system", deps)).allowed).toBe(true);
    expect(await can(CUSTOMER, "ops.inbox-ai", "system", deps)).toMatchObject({ allowed: false, reason: "back_office_only" });
  });
});

describe("can() — shadow mode (ADR 017 §4)", () => {
  it("a refusing verdict still allows the call and writes entitlement.would_deny", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deps, audit } = gateFixture({ mode: "shadow", entitlement: null });
    const grant = await can(CUSTOMER, "social.dispatch", ACTOR, deps);
    expect(grant).toMatchObject({ allowed: true, shadow: true, reason: "no_entitlement" });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      event: "entitlement.would_deny", featureKey: "social.dispatch", subject: CUSTOMER, actor: ACTOR, payload: { reason: "no_entitlement" },
    }));
  });

  it("a shadow-allowed credits call is never debited", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deps, debit } = gateFixture({ mode: "shadow", balance: 0 });
    const grant = await can(CUSTOMER, "social.rewrite", ACTOR, deps);
    await grant.report({ units: 5 });
    expect(debit).not.toHaveBeenCalled();
  });

  it("a missing table still allows the call (enforce refuses the same case)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const storeError = new Error('relation "organization_entitlements" does not exist');
    const shadow = gateFixture({ mode: "shadow", storeError });
    expect(await can(CUSTOMER, "social.dispatch", ACTOR, shadow.deps)).toMatchObject({ allowed: true, shadow: true, reason: "infrastructure_error" });
    expect(shadow.audit).toHaveBeenCalledWith(expect.objectContaining({ event: "entitlement.infra_error" }));
    expect((await can(CUSTOMER, "social.dispatch", ACTOR, gateFixture({ mode: "enforce", storeError }).deps)).allowed).toBe(false);
  });

  it("unreadable signing keys, an audit failure and a failing report never throw to the caller", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const keys = gateFixture({ mode: "shadow", balance: 5 });
    keys.deps.publicKeys = () => { throw new Error("entitlement_public_keys_missing"); };
    expect((await can(CUSTOMER, "social.rewrite", ACTOR, keys.deps)).allowed).toBe(true);
    const noAudit = gateFixture({ mode: "shadow", entitlement: null });
    noAudit.audit.mockRejectedValue(new Error("db down"));
    const grant = await can(CUSTOMER, "social.dispatch", ACTOR, noAudit.deps);
    expect(grant.allowed).toBe(true);
    await expect(grant.report({ units: 1 })).resolves.toBeUndefined();
  });

  it("an unset ENTITLEMENT_MODE is shadow; only the exact word enforce enforces", () => {
    expect(entitlementMode({})).toBe("shadow");
    expect(entitlementMode({ ENTITLEMENT_MODE: "shadow" })).toBe("shadow");
    expect(entitlementMode({ ENTITLEMENT_MODE: "enfroce" })).toBe("shadow");
    expect(entitlementMode({ ENTITLEMENT_MODE: "enforce" })).toBe("enforce");
  });
});

describe("subject resolution (one rule)", () => {
  const rows: Record<string, OrgRow> = {
    root: { id: "root", parent_organization_id: null, kind: "customer" },
    brand: { id: "brand", parent_organization_id: "root", kind: "customer" },
    ops: { id: "ops", parent_organization_id: null, kind: "internal" },
  };
  const store: SubjectStore = { byId: async (id) => rows[id] ?? null, bySlug: async (s) => (s === "acme" ? rows.brand : null), internal: async () => rows.ops };
  const req = (headers: Record<string, string>) => new Request("http://localhost/x", { headers });

  it("a brand bills its root account; no customer bills the internal account", async () => {
    expect(await resolveSubject({ brandId: "brand" }, store)).toEqual({ orgId: "root", kind: "customer" });
    expect(await resolveSubject({ slug: "acme" }, store)).toEqual({ orgId: "root", kind: "customer" });
    expect(await resolveSubject({}, store)).toEqual({ orgId: "ops", kind: "internal" });
    expect(await resolveSubject({ req: req({ "x-ops-user-kind": "staff" }) }, store)).toEqual({ orgId: "ops", kind: "internal" });
  });

  it("a client session bills its own org tree", async () => {
    const client = req({ "x-ops-user-kind": "client", "x-ops-org-id": "brand" });
    expect(await resolveSubject({ req: client }, store)).toEqual({ orgId: "root", kind: "customer" });
  });

  it("an unknown org fails (never silently falls back to internal)", async () => {
    await expect(resolveSubject({ orgId: "nope" }, store)).rejects.toThrow("subject_not_found");
  });
});

describe("withFeature / grantFor", () => {
  const store: SubjectStore = { byId: async () => null, bySlug: async () => null, internal: async () => ({ id: INTERNAL.orgId, parent_organization_id: null, kind: "internal" }) };

  it("answers 403 {code: no_credits} in enforce and runs the handler with the grant otherwise", async () => {
    const handler = vi.fn(async () => new Response("ok"));
    const refused = withFeature("content.title", handler, { deps: gateFixture({ entitlement: null }).deps, subjects: store });
    const res = await refused(new Request("http://localhost/api/content/title", { method: "POST" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "no_credits" });
    expect(handler).not.toHaveBeenCalled();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const shadow = withFeature("content.title", handler, { deps: gateFixture({ mode: "shadow", entitlement: null }).deps, subjects: store });
    expect((await shadow(new Request("http://localhost/api/content/title", { method: "POST" }))).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("refuses to wrap a feature that is not registered in route-features.ts", () => {
    expect(() => withFeature("content.unlisted", async () => new Response("x"))).toThrow("not registered");
  });

  it("naming an org without AuthorizedOrg is refused when a person is calling; server data with no caller may name it", async () => {
    const customer = { ...store, byId: async () => ({ id: CUSTOMER.orgId, parent_organization_id: null, kind: "customer" as const }) };
    const deps = gateFixture({ balance: 50 }).deps;
    const staff = new Request("http://localhost/api/x", { headers: { "x-ops-user-kind": "staff", "x-ops-claims-role": "operator" } });
    await expect(grantFor("social.rewrite", { req: staff, orgId: CUSTOMER.orgId, deps, subjects: customer })).rejects.toMatchObject({ code: "not_authorized_for_org" });
    expect((await grantFor("social.rewrite", { orgId: CUSTOMER.orgId, deps, subjects: customer })).subject).toEqual(CUSTOMER);
  });

  it("grantFor throws EntitlementRequired when enforce refuses", async () => {
    await expect(grantFor("content.title", { deps: gateFixture({ entitlement: null }).deps, subjects: store })).rejects.toMatchObject({ code: "no_credits" });
  });
});
