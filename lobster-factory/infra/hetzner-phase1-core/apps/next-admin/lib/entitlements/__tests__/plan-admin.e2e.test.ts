// /ops/plans against a real Postgres + PostgREST: migration 0147's create / update through lib/entitlements/plans-admin.ts
// (over 0145's seeded credit plans: a base or add-on may not share a feature with an add-on of its product).
// Run by the entitlements real-db harness (--suite plan-admin, sets ENTITLEMENTS_REST); skipped otherwise. No production.
import type http from "node:http";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPlan, getPlan, listPlans, updatePlan, type PlanInput } from "../plans-admin";
import { startRestProxy } from "./real-db";

const REST = process.env.ENTITLEMENTS_REST;
const OPS = "00000000-0000-4000-8000-0000000000a1";   // the internal account the harness seeds (one allowed); the test names it awarewave-ops
const CUSTOMER = "00000000-0000-4000-8000-0000000000c2";
const SELLER = "00000000-0000-4000-8000-0000000000c3";

describe.skipIf(!REST)("staff plan admin against a real database (0147)", () => {
  let proxy: http.Server;
  let db: SupabaseClient;
  const owner = { actor: "ops:owner:e2e", actorRole: "owner" };
  const studio: PlanInput = { planKey: "e2e_studio", productKey: "cs", kind: "base", features: ["cs.intent", "cs.answer"], limits: { "cs.intent": { pay: "credits" } } };
  const rpc = async (fn: string, args: Record<string, unknown>) => (await db.rpc(fn, args)).error?.message;
  const audits = async () => {
    const { data, error } = await db.from("ops_audit_events").select("event_type, target_id, payload").eq("organization_id", OPS).order("created_at");
    if (error) throw new Error(error.message);
    return data ?? [];
  };

  beforeAll(async () => {
    proxy = await startRestProxy(REST!);
    db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const renamed = await db.from("organizations").update({ slug: "awarewave-ops" }).eq("id", OPS);
    if (renamed.error) throw new Error(renamed.error.message);
    const { error } = await db.from("organizations").insert([
      { id: CUSTOMER, type: "client", name: "Customer", slug: "e2e-plan-customer", kind: "customer" },
      { id: SELLER, type: "client", name: "Seller", slug: "e2e-plan-seller", kind: "customer" },
    ]);
    if (error) throw new Error(error.message);
  });
  afterAll(async () => { proxy?.close(); });

  it("create writes the plan and one audit row; the same key again is refused", async () => {
    expect(await createPlan(studio, owner, db)).toBe("saved");
    expect(await getPlan("e2e_studio", db)).toMatchObject({ kind: "base", features: ["cs.intent", "cs.answer"], limits: studio.limits, ownerOrganizationId: null });
    expect(await createPlan(studio, owner, db)).toBe("plan_exists");
    const rows = (await audits()).filter((a) => a.target_id === "e2e_studio");
    expect(rows.map((a) => a.event_type)).toEqual(["plan.create"]);
    expect(rows[0].payload).toMatchObject({ actor: "ops:owner:e2e", product_key: "cs" });
  });

  it("the database refuses what the payment path would refuse, even when called around the page's checks", async () => {
    const base = { p_plan_key: "e2e_bad", p_product_key: "cs", p_kind: "base", p_features: ["cs.eval"], p_limits: {}, p_actor: "x", p_actor_role: "owner" };
    expect(await rpc("plan_admin_create", { ...base, p_plan_key: "Bad Key" })).toContain("plan_admin:invalid_plan_key");
    expect(await rpc("plan_admin_create", { ...base, p_product_key: "nope" })).toContain("check constraint");   // the plans table's own product list
    expect(await rpc("plan_admin_create", { ...base, p_features: [] })).toContain("plan_admin:invalid_features");
    expect(await rpc("plan_admin_create", { ...base, p_features: ["cs.eval", "cs.eval"] })).toContain("plan_admin:invalid_features");
    expect(await rpc("plan_admin_create", { ...base, p_limits: { "cs.exam": { pay: "credits" } } })).toContain("plan_admin:invalid_limits");
    expect(await rpc("plan_admin_create", { ...base, p_limits: { "cs.eval": { pay: "free" } } })).toContain("plan_admin:invalid_limits");
    expect(await rpc("plan_admin_create", { ...base, p_kind: "addon" })).toContain("plan_admin:addon_needs_credits");
    expect(await rpc("plan_admin_create", { ...base, p_actor_role: "operator" })).toContain("plan_admin:forbidden");
    expect(await rpc("plan_admin_create", { ...base, p_actor: " " })).toContain("plan_admin:invalid_actor");
    expect(await getPlan("e2e_bad", db)).toBeNull();
  });

  it("update changes features and limits only, with before and after in the audit row; a used plan may change", async () => {
    const { error } = await db.from("organization_product_subscriptions").insert({ organization_id: CUSTOMER, product_key: "cs", plan_key: "e2e_studio", status: "active" });
    if (error) throw new Error(error.message);
    const current = (await getPlan("e2e_studio", db))!;
    expect(await updatePlan(current, ["cs.intent"], { "cs.intent": { pay: "credits" } }, owner, db)).toBe("saved");
    expect(await getPlan("e2e_studio", db)).toMatchObject({ features: ["cs.intent"], kind: "base", productKey: "cs" });
    const row = (await audits()).filter((a) => a.event_type === "plan.update").pop()!;
    expect(row.payload).toMatchObject({ before: { features: ["cs.intent", "cs.answer"] }, after: { features: ["cs.intent"] } });
    expect(await rpc("plan_admin_update", { p_plan_key: "nope", p_features: ["cs.intent"], p_limits: {}, p_actor: "x", p_actor_role: "owner" })).toContain("plan_admin:not_found");
    expect((await listPlans(db)).map((p) => p.planKey)).toContain("e2e_studio");
    expect(await rpc("plan_admin_delete", { p_plan_key: "e2e_studio", p_actor: "x", p_actor_role: "owner" })).toBeDefined();   // there is no delete
  });

  it("no feature is shared between an add-on and any other plan of its product, either way (critic 2026-10-30 C1)", async () => {
    // 0145's studio_credits holds studio.image: a studio base naming it is refused, as is a second studio add-on
    for (const kind of ["base", "addon"]) {
      expect(await createPlan({ planKey: `e2e_overlap_${kind}`, productKey: "studio", kind, features: ["studio.image"], limits: { "studio.image": { pay: "credits" } } }, owner, db), kind).toBe("overlaps_plan");
    }
    // e2e_studio (cs base) holds cs.intent: an add-on with it is refused, one with another cs feature is fine
    expect(await createPlan({ planKey: "e2e_cs_pack", productKey: "cs", kind: "addon", features: ["cs.intent"], limits: { "cs.intent": { pay: "credits" } } }, owner, db)).toBe("overlaps_plan");
    expect(await createPlan({ planKey: "e2e_cs_pack", productKey: "cs", kind: "addon", features: ["cs.exam"], limits: { "cs.exam": { pay: "credits" } } }, owner, db)).toBe("saved");
    // and an edit cannot walk a plan into the overlap
    const base = (await getPlan("e2e_studio", db))!;
    expect(await updatePlan(base, ["cs.intent", "cs.exam"], { "cs.intent": { pay: "credits" } }, owner, db)).toBe("overlaps_plan");
    // two base plans of one product may share features (tiers; one live base contract per product, 0133)
    expect(await createPlan({ planKey: "e2e_cs_base2", productKey: "cs", kind: "base", features: ["cs.intent"], limits: {} }, owner, db)).toBe("saved");
  });

  it("a seller's plan (owner set) cannot be changed here", async () => {
    const { error } = await db.from("plans").insert({ plan_key: "e2e_seller_plan", product_key: "studio", kind: "base", features: ["studio.image"], limits: {}, owner_organization_id: SELLER });
    if (error) throw new Error(error.message);
    const current = (await getPlan("e2e_seller_plan", db))!;
    expect(await updatePlan(current, ["studio.image", "studio.fill"], {}, owner, db)).toBe("not_editable");
    expect((await getPlan("e2e_seller_plan", db))?.features).toEqual(["studio.image"]);
  });

  it("an addon needs pay=credits on every feature in the database too", async () => {
    expect(await rpc("plan_admin_update", { p_plan_key: "e2e_cs_pack", p_features: ["cs.exam", "cs.translate"], p_limits: { "cs.exam": { pay: "credits" } }, p_actor: "x", p_actor_role: "owner" }))
      .toContain("plan_admin:addon_needs_credits");
  });
});
