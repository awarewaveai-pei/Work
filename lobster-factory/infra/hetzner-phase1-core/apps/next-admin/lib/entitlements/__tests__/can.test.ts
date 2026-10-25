import { afterEach, describe, expect, it, vi } from "vitest";
import { SELLER_LICENCES, can, entitlementMode, sellerLicenceKey, sellerMaySell, verdictOf } from "../can";
import { registeredFeatures } from "../tables";
import { PRODUCTS } from "@/lib/portal/products";
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

  it("a wallet alone opens nothing", async () => {
    // a funded wallet and no row for this feature (the fixture row is social.dispatch): refused, and the wallet is never read
    const { deps, findActiveEntitlement } = gateFixture({ balance: 500 });
    expect(await can(CUSTOMER, "social.rewrite", ACTOR, deps)).toMatchObject({ allowed: false, reason: "no_entitlement" });
    expect(findActiveEntitlement).toHaveBeenCalledWith(expect.objectContaining({ featureKey: "social.rewrite" }));
    expect(await can(CUSTOMER, "social.rewrite", ACTOR, gateFixture({ entitlement: null, balance: 500 }).deps)).toMatchObject({ allowed: false, reason: "no_entitlement" });
    // a lapsed row is no row
    const lapsed = gateFixture({ entitlement: { featureKey: "social.rewrite", source: "comp", endsAt: Math.floor(Date.now() / 1000) - 1 }, balance: 500 });
    expect(await can(CUSTOMER, "social.rewrite", ACTOR, lapsed.deps)).toMatchObject({ allowed: false, reason: "no_entitlement" });
  });

  it("a contract row on a credits feature spends the wallet", async () => {
    const funded = gateFixture({ credits: true, balance: 50 });
    const grant = await can(CUSTOMER, "social.rewrite", ACTOR, funded.deps);
    expect(grant).toMatchObject({ allowed: true, maxSpend: 50, info: { source: "credits", entitlementId: null } });
    await grant.report({ units: 3, idempotencyKey: "idem-key-0006" });
    expect(funded.debit).toHaveBeenCalledWith(expect.objectContaining({ orgId: CUSTOMER.orgId, units: 3 }));
    expect(await can(CUSTOMER, "social.rewrite", ACTOR, gateFixture({ credits: true, balance: 0 }).deps)).toMatchObject({ allowed: false, reason: "no_credits" });
  });

  it("a pay marker anywhere but a contract row of a credits-billed feature is refused as bad plan data, never free", async () => {
    const cases = [
      { featureKey: "social.dispatch", ask: "social.dispatch", source: "contract" as const, limits: { pay: "credits" } }, // contract-billed feature
      { featureKey: "social.rewrite", ask: "social.rewrite", source: "comp" as const, limits: { pay: "credits" } },        // a gift that says pay
      { featureKey: "social.rewrite", ask: "social.rewrite", source: "contract" as const, limits: { pay: "Credits" } },
      { featureKey: "social.rewrite", ask: "social.rewrite", source: "contract" as const, limits: { pay: true } },
      { featureKey: "social.rewrite", ask: "social.rewrite", source: "contract" as const, limits: { pay: { mode: "credits" } } },
    ];
    for (const c of cases) {
      const { deps, debit } = gateFixture({ entitlement: { featureKey: c.featureKey, source: c.source, limits: c.limits }, balance: 500 });
      expect(await can(CUSTOMER, c.ask, ACTOR, deps)).toMatchObject({ allowed: false, reason: "invalid_pay_marker" });
      expect(debit).not.toHaveBeenCalled();
    }
  });

  it("a comp row on a credits feature is free", async () => {
    // comp and contract rows without pay: credits (gifts, all-features accounts, managed-client contracts) cover the use
    for (const source of ["comp", "contract"] as const) {
      const { deps, debit } = gateFixture({ entitlement: { featureKey: "social.rewrite", source }, balance: 0 });
      const grant = await can(CUSTOMER, "social.rewrite", ACTOR, deps);
      expect(grant).toMatchObject({ allowed: true, maxSpend: null, info: { source, entitlementId: "ent-1" } });
      await grant.report({ units: 3, idempotencyKey: "idem-key-0005" });
      expect(debit).not.toHaveBeenCalled();
    }
  });

  it("a credits permit carries source=credits, no entitlement_id and max_spend = min(balance, cap)", async () => {
    const small = await can(CUSTOMER, "social.rewrite", ACTOR, gateFixture({ credits: true, balance: 40 }).deps);
    expect(small.info).toMatchObject({ source: "credits", entitlementId: null, maxSpend: 40 });
    const big = await can(CUSTOMER, "social.rewrite", ACTOR, gateFixture({ credits: true, balance: 5000 }).deps);
    expect(big.maxSpend).toBe(100);
  });

  it("a staff actor acting for a customer org debits that org and the audit row names the staff user", async () => {
    const { deps, debit, audit } = gateFixture({ credits: true, balance: 50 });
    const grant = await can(CUSTOMER, "social.rewrite", ACTOR, deps);
    await grant.report({ units: 3, idempotencyKey: "idem-key-0001" });
    expect(debit).toHaveBeenCalledWith({ orgId: CUSTOMER.orgId, units: 3, idempotencyKey: "idem-key-0001", featureKey: "social.rewrite" });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ event: "entitlement.usage", actor: ACTOR, subject: CUSTOMER }));
  });

  it("a grant cannot be edited into an allowed one at runtime, nor retargeted to another org", async () => {
    const denied = await can(CUSTOMER, "social.dispatch", ACTOR, gateFixture({ entitlement: null }).deps);
    expect(() => { (denied as never as { info: { allowed: boolean } }).info.allowed = true; }).toThrow(TypeError);
    expect(denied.allowed).toBe(false);
    const { deps, debit } = gateFixture({ credits: true, balance: 50 });
    const grant = await can(CUSTOMER, "social.rewrite", ACTOR, deps);
    expect(() => { (grant.subject as { orgId: string }).orgId = "victim"; }).toThrow(TypeError);
    expect(Object.isFrozen(CUSTOMER)).toBe(false);   // the caller's own object is untouched
    await grant.report({ units: 1, idempotencyKey: "idem-key-0004" });
    expect(debit).toHaveBeenCalledWith(expect.objectContaining({ orgId: CUSTOMER.orgId }));
  });

  it("shadow never debits, even when the verdict allows", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deps, debit } = gateFixture({ credits: true, mode: "shadow", balance: 50 });
    const grant = await can(CUSTOMER, "social.rewrite", ACTOR, deps);
    expect(grant.allowed).toBe(true);
    await grant.report({ units: 3, idempotencyKey: "idem-key-0005" });
    expect(debit).not.toHaveBeenCalled();
  });

  it("a debit needs the caller's idempotency key, and an audit failure after a debit does not throw", async () => {
    const { deps, debit, audit } = gateFixture({ credits: true, balance: 50 });
    const grant = await can(CUSTOMER, "social.rewrite", ACTOR, deps);
    await expect(grant.report({ units: 1 })).rejects.toThrow("idempotency_key_required");
    expect(debit).not.toHaveBeenCalled();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    audit.mockRejectedValue(new Error("db down"));
    await expect(grant.report({ units: 1, idempotencyKey: "idem-key-0003" })).resolves.toBeUndefined();
    expect(debit).toHaveBeenCalledTimes(1);
  });

  it("refuses spend above max_spend and an unfunded debit", async () => {
    const grant = await can(CUSTOMER, "social.rewrite", ACTOR, gateFixture({ credits: true, balance: 10 }).deps);
    await expect(grant.report({ units: 11 })).rejects.toThrow("exceeds_max_spend");
    const broke = await can(CUSTOMER, "social.rewrite", ACTOR, gateFixture({ credits: true, balance: 10, debitAllowed: false }).deps);
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
    const { deps, debit } = gateFixture({ credits: true, mode: "shadow", balance: 0 });
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
    const keys = gateFixture({ credits: true, mode: "shadow", balance: 5 });
    keys.deps.publicKeys = () => { throw new Error("entitlement_public_keys_missing"); };
    expect((await can(CUSTOMER, "social.rewrite", ACTOR, keys.deps)).allowed).toBe(true);
    const noAudit = gateFixture({ mode: "shadow", entitlement: null });
    noAudit.audit.mockRejectedValue(new Error("db down"));
    const grant = await can(CUSTOMER, "social.dispatch", ACTOR, noAudit.deps);
    expect(grant.allowed).toBe(true);
    await expect(grant.report({ units: 1 })).resolves.toBeUndefined();
  });

  it("a customer acting for itself gets the real verdict, the debit and a refused infrastructure error; staff stay shadowed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const SELF = `client:${CUSTOMER.orgId}:user-1`;
    expect(await can(CUSTOMER, "social.dispatch", SELF, gateFixture({ mode: "shadow", entitlement: null }).deps)).toMatchObject({ allowed: false, shadow: false, reason: "no_entitlement" });
    expect(await can(CUSTOMER, "social.dispatch", ACTOR, gateFixture({ mode: "shadow", entitlement: null }).deps)).toMatchObject({ allowed: true, shadow: true });
    const funded = gateFixture({ credits: true, mode: "shadow", balance: 50 });
    await (await can(CUSTOMER, "social.rewrite", SELF, funded.deps)).report({ units: 2, idempotencyKey: "idem-key-0009" });
    expect(funded.debit).toHaveBeenCalledWith(expect.objectContaining({ orgId: CUSTOMER.orgId, units: 2 }));
    const storeError = new Error("db down");
    expect((await can(CUSTOMER, "social.dispatch", SELF, gateFixture({ mode: "shadow", storeError }).deps)).allowed).toBe(false);
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

  it("a client session with no organization fails instead of billing the internal account", async () => {
    await expect(resolveSubject({ req: req({ "x-ops-user-kind": "client" }) }, store)).rejects.toThrow("client_without_org");
  });

  it("an unknown org fails (never silently falls back to internal)", async () => {
    await expect(resolveSubject({ orgId: "nope" }, store)).rejects.toThrow("subject_not_found");
  });
});

describe("withFeature / grantFor", () => {
  const store: SubjectStore = { byId: async () => null, bySlug: async () => null, internal: async () => ({ id: INTERNAL.orgId, parent_organization_id: null, kind: "internal" }) };

  it("answers 403 {code: no_entitlement} in enforce and runs the handler with the grant otherwise", async () => {
    const handler = vi.fn(async () => new Response("ok"));
    const refused = withFeature("content.title", handler, { deps: gateFixture({ entitlement: null }).deps, subjects: store });
    const res = await refused(new Request("http://localhost/api/content/title", { method: "POST" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "no_entitlement" });
    expect(handler).not.toHaveBeenCalled();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const shadow = withFeature("content.title", handler, { deps: gateFixture({ mode: "shadow", entitlement: null }).deps, subjects: store });
    expect((await shadow(new Request("http://localhost/api/content/title", { method: "POST" }))).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("a library grantFor inside the route reuses the route's grant for the same feature, with no second verdict", async () => {
    const { deps, findActiveEntitlement } = gateFixture({ credits: true, balance: 50 });
    let inner: unknown;
    const route = withFeature("content.title", async (_req, grant) => { inner = { route: grant, lib: await grantFor("content.title") }; return new Response("ok"); }, { deps, subjects: store });
    await route(new Request("http://localhost/api/content/title", { method: "POST" }));
    const { route: g1, lib: g2 } = inner as { route: unknown; lib: unknown };
    expect(g2).toBe(g1);
    expect(findActiveEntitlement).toHaveBeenCalledTimes(1);
  });

  it("refuses to wrap a feature that is not registered in route-features.ts", () => {
    expect(() => withFeature("content.unlisted", async () => new Response("x"))).toThrow("not registered");
  });

  it("naming an org without AuthorizedOrg is refused when a person is calling; server data with no caller may name it", async () => {
    const customer = { ...store, byId: async () => ({ id: CUSTOMER.orgId, parent_organization_id: null, kind: "customer" as const }) };
    const deps = gateFixture({ credits: true, balance: 50 }).deps;
    const staff = new Request("http://localhost/api/x", { headers: { "x-ops-user-kind": "staff", "x-ops-claims-role": "operator" } });
    await expect(grantFor("social.rewrite", { req: staff, orgId: CUSTOMER.orgId, deps, subjects: customer })).rejects.toMatchObject({ code: "not_authorized_for_org" });
    expect((await grantFor("social.rewrite", { orgId: CUSTOMER.orgId, deps, subjects: customer })).subject).toEqual(CUSTOMER);
  });

  it("grantFor throws EntitlementRequired when enforce refuses", async () => {
    await expect(grantFor("content.title", { deps: gateFixture({ entitlement: null }).deps, subjects: store })).rejects.toMatchObject({ code: "no_entitlement" });
  });
});

describe("seller licences (ADR 017 decision #12, D3)", () => {
  const now = Math.floor(Date.now() / 1000);
  const store = (row: Partial<import("../can").EntitlementRecord> | null) => {
    const findActiveEntitlement = vi.fn(async () => row === null ? null
      : { id: "lic-1", organizationId: CUSTOMER.orgId, productKey: "social", featureKey: sellerLicenceKey("social"), source: "comp" as const,
        sourceRef: "staff", startsAt: now - 60, endsAt: null, status: "active", limits: {}, ...row });
    return { findActiveEntitlement, getCreditBalance: async () => 0 };
  };

  it("every product has one seller licence and none is a product feature", () => {
    expect([...SELLER_LICENCES.values()].sort()).toEqual(PRODUCTS.map((p) => p.key).sort());
    const features = new Set(PRODUCTS.flatMap((p) => p.features.map((f) => f.feature_key)));
    for (const key of SELLER_LICENCES.keys()) expect(features.has(key), key).toBe(false);
    // so neither the door menu nor an all-features account (0118) ever reaches one
    for (const f of registeredFeatures()) expect(SELLER_LICENCES.has(f.feature_key), f.feature_key).toBe(false);
  });

  it("a customer without the seller licence row cannot sell", async () => {
    expect(await sellerMaySell(store(null), CUSTOMER, "social", now)).toBe(false);
    // a row for another product's licence is not this one
    expect(await sellerMaySell(store({ productKey: "video", featureKey: sellerLicenceKey("video") }), CUSTOMER, "social", now)).toBe(false);
  });

  it("a customer with a live seller licence row can sell; an ended one cannot", async () => {
    expect(await sellerMaySell(store({}), CUSTOMER, "social", now)).toBe(true);
    expect(await sellerMaySell(store({ endsAt: now - 1 }), CUSTOMER, "social", now)).toBe(false);
  });

  it("the internal account sells every product without a row", async () => {
    const s = store(null);
    for (const key of SELLER_LICENCES.values()) expect(await sellerMaySell(s, INTERNAL, key, now)).toBe(true);
    expect(s.findActiveEntitlement).not.toHaveBeenCalled();
  });

  it("can() never answers a seller licence, in shadow or enforce", async () => {
    for (const mode of ["shadow", "enforce"] as const) {
      const { deps } = gateFixture({ mode, entitlement: { featureKey: sellerLicenceKey("social") } });
      expect(await verdictOf(CUSTOMER, sellerLicenceKey("social"), ACTOR, deps)).toEqual({ allowed: false, reason: "unknown_feature" });
      expect(await can(CUSTOMER, sellerLicenceKey("social"), ACTOR, deps)).toMatchObject({ allowed: false, reason: "seller_licence_not_a_feature" });
    }
  });
});
