/**
 * Drill: every account we have, plus one per missing way, run through the real judgment (ADR 017 §0 three axes, five
 * ways). The store mirrors prod as read on 2026-10-23 (organizations + organization_all_features + entitlements; no
 * plans, no wallet entries, no subscriptions); accounts marked "added" do not exist in prod. Real can(), real subject
 * resolution, real usage metering -- only the database rows are in memory.
 */
import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PRODUCTS } from "@/lib/portal/products";
import { can, type EntitlementMode, type EntitlementRecord, type GateDependencies } from "../can";
import { grantFor, thenRun, withFeature } from "../grant";
import { resolveSubject, type OrgRow, type SubjectStore } from "../subject";

afterEach(() => vi.restoreAllMocks());
// actorFor reads brand member rows for a staff member below owner/admin; the drill has none.
vi.mock("@/lib/social/store", () => ({ memberRoles: async () => new Map() }));

type Account = { id: string; slug: string; kind: "internal" | "customer"; parent?: string; covers?: { source: "comp" | "contract"; products?: string[] }; wallet?: number };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ACCOUNTS: Record<string, Account> = {
  // prod, 2026-10-23
  internal: { id: id(1), slug: "awarewave-ops", kind: "internal", covers: { source: "comp" } },
  soulful: { id: id(2), slug: "soulful-expression", kind: "customer", covers: { source: "contract" } },
  edd: { id: id(3), slug: "edd-research", kind: "customer", covers: { source: "comp" } },
  mongolia: { id: id(4), slug: "mongolia-03-6fc1c8", kind: "customer" },
  e2e: { id: id(5), slug: "e2e-verify-0704-5c1356", kind: "customer" },
  wptest: { id: id(6), slug: "test-wp-webhook-co-c705c6", kind: "customer" },
  // added for the ways no real account covers
  creditsBuyer: { id: id(7), slug: "drill-credits", kind: "customer", wallet: 50 },
  socialSubscriber: { id: id(8), slug: "drill-social-subscriber", kind: "customer", covers: { source: "contract", products: ["social"] } },
  soulfulBrand: { id: id(9), slug: "drill-soulful-brand", kind: "customer", parent: id(2) },
};
const byId = new Map(Object.values(ACCOUNTS).map((a) => [a.id, a]));
const row = (a: Account): OrgRow => ({ id: a.id, parent_organization_id: a.parent ?? null, kind: a.kind });
const subjects: SubjectStore = {
  byId: async (x) => (byId.get(x) ? row(byId.get(x)!) : null),
  bySlug: async (s) => { const a = Object.values(ACCOUNTS).find((x) => x.slug === s); return a ? row(a) : null; },
  internal: async () => row(ACCOUNTS.internal),
};
const productOf = new Map(PRODUCTS.flatMap((p) => p.features.map((f) => [f.feature_key, p.key] as const)));

const pair = generateKeyPairSync("ed25519");
function deps(mode: EntitlementMode) {
  const audit = vi.fn().mockResolvedValue(undefined);
  const debit = vi.fn().mockResolvedValue(true);
  const now = Math.floor(Date.now() / 1000);
  const d: GateDependencies = {
    permit: async () => ({
      store: {
        async findActiveEntitlement({ organizationId, productKey, featureKey }): Promise<EntitlementRecord | null> {
          const a = byId.get(organizationId);
          if (!a?.covers || (a.covers.products && !a.covers.products.includes(productKey))) return null;
          return { id: `ent-${a.slug}-${featureKey}`, organizationId, productKey, featureKey, source: a.covers.source,
            sourceRef: `all-features:${a.slug}`, startsAt: now - 60, endsAt: null, status: "active", limits: {} };
        },
        getCreditBalance: async (org) => byId.get(org)?.wallet ?? 0,
      },
      key: { kid: "k1", privateKey: pair.privateKey },
      creditPolicy: async () => ({ minimumCharge: 1, singleLimit: 1000 }),
    }),
    publicKeys: () => ({ k1: pair.publicKey }),
    mode: () => mode,
    audit, debit,
  };
  return { d, audit, debit };
}
const ask = async (account: Account, feature: string, actor: string, mode: EntitlementMode = "shadow") => {
  const { d, audit, debit } = deps(mode);
  const subject = await resolveSubject({ orgId: account.id }, subjects);
  const grant = await can(subject, feature, actor, d);
  return { grant, audit, debit, usage: () => audit.mock.calls.map(([e]) => e).filter((e) => e.event === "entitlement.usage") };
};
const staff = "ops:operator:staff-1";
const client = (a: Account) => `client:${a.id}:user-1`;

describe("drill: our accounts on the three axes", () => {
  it("every drill feature is a registered product feature", () => {
    for (const f of ["tarot.image", "content.title", "studio.image", "social.dispatch", "social.rewrite"]) expect(productOf.has(f), f).toBe(true);
  });

  it("自用 awarewave-ops (hosted / comp / staff): allowed on its comp rows and on back-office tools, never debited", async () => {
    const r = await ask(ACCOUNTS.internal, "tarot.image", staff, "enforce");
    expect(r.grant).toMatchObject({ allowed: true, subject: { orgId: ACCOUNTS.internal.id, kind: "internal" }, info: { source: "comp" } });
    expect((await ask(ACCOUNTS.internal, "ops.cheap-json", staff, "enforce")).grant.allowed).toBe(true);
    await r.grant.recordUse({ provider: "replicate" });
    expect(r.debit).not.toHaveBeenCalled();
  });

  it("代操 soulful-expression (hosted / contract / staff on_behalf_of soulful): the customer's contract pays, the row names the staff member", async () => {
    const r = await ask(ACCOUNTS.soulful, "content.title", staff, "enforce");
    expect(r.grant).toMatchObject({ allowed: true, subject: { orgId: ACCOUNTS.soulful.id, kind: "customer" }, actor: staff, info: { source: "contract" } });
    await r.grant.recordUse({ provider: "anthropic" });
    expect(r.usage()).toEqual([expect.objectContaining({ subject: { orgId: ACCOUNTS.soulful.id, kind: "customer" }, actor: staff })]);
    expect(r.debit).not.toHaveBeenCalled();
  });

  it("代操 for a brand under soulful bills soulful (the root of the org tree)", async () => {
    const r = await ask(ACCOUNTS.soulfulBrand, "social.dispatch", staff, "enforce");
    expect(r.grant).toMatchObject({ allowed: true, subject: { orgId: ACCOUNTS.soulful.id } });
  });

  it("代操 staff rendering a video for soulful (withFeature org): narration and scene images bill soulful under the staff member; staff tooling stays internal", async () => {
    const { d, audit, debit } = deps("enforce");
    const owner = new Request("http://localhost/api/video/render-draft", { method: "POST", headers: { "x-ops-user-kind": "staff", "x-ops-claims-role": "owner", "x-ops-user-id": "staff-1" } });
    const seen: Record<string, unknown> = {};
    const res = await withFeature("video.tts", thenRun, { org: () => ACCOUNTS.soulful.id, deps: d, subjects })(owner, async () => {
      // what render-client.ts and buildSceneAsset do inside the route: a plain library ask, then the meter
      const tts = await grantFor("video.tts");
      await tts.recordUse({ provider: "openai", via: "video-service" });
      seen.image = (await grantFor("video.image")).subject;
      seen.tooling = (await grantFor("ops.cheap-json")).subject;
      return new Response("ok");
    });
    expect(res.status).toBe(200);
    const usage = audit.mock.calls.map(([e]) => e).filter((e) => e.event === "entitlement.usage");
    expect(usage).toEqual([expect.objectContaining({ featureKey: "video.tts", subject: { orgId: ACCOUNTS.soulful.id, kind: "customer" }, actor: "ops:owner:staff-1" })]);
    expect(seen).toEqual({ image: { orgId: ACCOUNTS.soulful.id, kind: "customer" }, tooling: { orgId: ACCOUNTS.internal.id, kind: "internal" } });
    expect(debit).not.toHaveBeenCalled();
  });

  it("代操 by an operator with no role at soulful: enforce refuses not_authorized_for_org; shadow lets it run but every ask stays flagged, never billed internal", async () => {
    const operator = () => new Request("http://localhost/api/video/regenerate-image", { method: "POST", headers: { "x-ops-user-kind": "staff", "x-ops-claims-role": "operator", "x-ops-user-id": "staff-2" } });
    const enforce = deps("enforce");
    const refused = await withFeature("video.image", thenRun, { org: () => ACCOUNTS.soulful.id, deps: enforce.d, subjects })(operator(), async () => new Response("ran"));
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "not_authorized_for_org" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const shadow = deps("shadow");
    const seen: Record<string, unknown> = {};
    const ran = await withFeature("video.image", thenRun, { org: () => ACCOUNTS.soulful.id, deps: shadow.d, subjects })(operator(), async () => {
      seen.script = (await grantFor("video.script")).subject.kind;
      seen.tooling = (await grantFor("ops.cheap-json")).subject.kind;
      return new Response("ran");
    });
    expect(ran.status).toBe(200);
    expect(seen).toEqual({ script: "unresolved", tooling: "internal" });
    expect(shadow.audit).toHaveBeenCalledWith(expect.objectContaining({ event: "entitlement.would_deny", payload: { reason: "not_authorized_for_org" } }));
  });

  it("訂閱 soulful's own login (hosted / contract / customer): always the real verdict; back-office AI is refused", async () => {
    expect((await ask(ACCOUNTS.soulful, "social.dispatch", client(ACCOUNTS.soulful))).grant).toMatchObject({ allowed: true, shadow: false, info: { source: "contract" } });
    expect((await ask(ACCOUNTS.soulful, "ops.cheap-json", client(ACCOUNTS.soulful))).grant).toMatchObject({ allowed: false, reason: "back_office_only" });
  });

  it("贈送 edd-research (hosted / comp / staff or customer): free on every product", async () => {
    expect((await ask(ACCOUNTS.edd, "studio.image", staff, "enforce")).grant).toMatchObject({ allowed: true, info: { source: "comp" } });
    expect((await ask(ACCOUNTS.edd, "studio.image", client(ACCOUNTS.edd))).grant).toMatchObject({ allowed: true, info: { source: "comp" } });
  });

  it("訂閱待付款 mongolia-03 (no rows, no wallet): the customer is refused; staff work is allowed in shadow but audited, refused in enforce", async () => {
    expect((await ask(ACCOUNTS.mongolia, "social.dispatch", client(ACCOUNTS.mongolia))).grant).toMatchObject({ allowed: false, reason: "no_entitlement" });
    expect((await ask(ACCOUNTS.mongolia, "tarot.image", client(ACCOUNTS.mongolia))).grant).toMatchObject({ allowed: false, reason: "no_credits" });
    const shadow = await ask(ACCOUNTS.mongolia, "tarot.image", staff, "shadow");
    expect(shadow.grant).toMatchObject({ allowed: true, shadow: true, reason: "no_credits" });
    expect(shadow.audit).toHaveBeenCalledWith(expect.objectContaining({ event: "entitlement.would_deny", featureKey: "tarot.image" }));
    expect((await ask(ACCOUNTS.mongolia, "tarot.image", staff, "enforce")).grant.allowed).toBe(false);
  });

  it("test accounts e2e-verify-0704 and test-wp-webhook-co (no rows): refused like any unpaid customer", async () => {
    for (const a of [ACCOUNTS.e2e, ACCOUNTS.wptest]) {
      expect((await ask(a, "social.dispatch", client(a))).grant).toMatchObject({ allowed: false, reason: "no_entitlement" });
    }
  });

  it("點數 drill-credits (added; hosted / credits / customer): the wallet answers credits features, never contract ones", async () => {
    const r = await ask(ACCOUNTS.creditsBuyer, "content.title", client(ACCOUNTS.creditsBuyer));
    expect(r.grant).toMatchObject({ allowed: true, maxSpend: 50, info: { source: "credits", entitlementId: null } });
    await r.grant.recordUse({ provider: "anthropic" });
    expect(r.debit).not.toHaveBeenCalled(); // units stay 0 until the operator sets per-feature prices
    expect((await ask(ACCOUNTS.creditsBuyer, "social.dispatch", client(ACCOUNTS.creditsBuyer))).grant).toMatchObject({ allowed: false, reason: "no_entitlement" });
  });

  it("訂閱 one product drill-social-subscriber (added; contract rows for social only): social works, other products do not", async () => {
    const who = client(ACCOUNTS.socialSubscriber);
    expect((await ask(ACCOUNTS.socialSubscriber, "social.dispatch", who)).grant).toMatchObject({ allowed: true, info: { source: "contract" } });
    expect((await ask(ACCOUNTS.socialSubscriber, "social.rewrite", who)).grant).toMatchObject({ allowed: true, info: { source: "contract" } });
    expect((await ask(ACCOUNTS.socialSubscriber, "tarot.image", who)).grant).toMatchObject({ allowed: false, reason: "no_credits" });
  });

  it.todo("賣斷 (self_hosted / perpetual / customer): licence file and offline verification are not built (ADR 017 order 5)");
  it.todo("API 通道 actor api_key:<id>: not built (ADR 017 order 6, waits for the first API-only customer)");
});
