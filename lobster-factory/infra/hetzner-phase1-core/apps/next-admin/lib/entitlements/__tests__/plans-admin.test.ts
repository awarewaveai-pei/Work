import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildLimits, createPlan, updatePlan, validatePlan, type PlanInput } from "../plans-admin";

// studio.* all bill in credits; design.edit bills by contract (the registry, lib/portal/products.ts).
const studio: PlanInput = { planKey: "studio_pro", productKey: "studio", kind: "base", features: ["studio.image", "studio.upscale"], limits: { "studio.image": { pay: "credits" } } };
const who = { actor: "ops:owner:u1", actorRole: "owner" };
const rpcClient = (error: { message: string } | null = null) => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
};

describe("plan rules (/ops/plans, migration 0147)", () => {
  it("rule 1: features must be the product's registered features", () => {
    expect(validatePlan(studio)).toEqual({ ok: true });
    expect(validatePlan({ ...studio, features: ["studio.image", "video.script"], limits: {} })).toEqual({ ok: false, error: "feature_not_in_product" });
    expect(validatePlan({ ...studio, features: ["studio.nope"], limits: {} })).toEqual({ ok: false, error: "feature_not_in_product" });
    expect(validatePlan({ ...studio, features: [], limits: {} })).toEqual({ ok: false, error: "no_features" });
    expect(validatePlan({ ...studio, productKey: "nope" })).toEqual({ ok: false, error: "invalid_product" });
  });

  it("rule 2: pay=credits only on a credits-billed feature, nothing else as a pay marker, no limits on a feature outside the plan", () => {
    const design = { ...studio, planKey: "design_pro", productKey: "design", features: ["design.edit"] };
    expect(validatePlan({ ...design, limits: {} })).toEqual({ ok: true });
    expect(validatePlan({ ...design, limits: { "design.edit": { pay: "credits" } } })).toEqual({ ok: false, error: "pay_on_contract_feature" });
    expect(validatePlan({ ...studio, limits: { "studio.image": { pay: "free" } } })).toEqual({ ok: false, error: "invalid_limits" });
    expect(validatePlan({ ...studio, limits: { "studio.fill": { pay: "credits" } } })).toEqual({ ok: false, error: "invalid_limits" });
    expect(validatePlan({ ...studio, limits: { "studio.image": "credits" as never } })).toEqual({ ok: false, error: "invalid_limits" });
  });

  it("rule 3: an addon (credit pack) has pay=credits on every feature", () => {
    const pack: PlanInput = { ...studio, planKey: "studio_pack", kind: "addon" };
    expect(validatePlan(pack)).toEqual({ ok: false, error: "addon_needs_credits" });
    expect(validatePlan({ ...pack, limits: { "studio.image": { pay: "credits" }, "studio.upscale": { pay: "credits" } } })).toEqual({ ok: true });
    const design = { ...pack, planKey: "design_pack", productKey: "design", features: ["design.edit"], limits: { "design.edit": { pay: "credits" } } };
    expect(validatePlan(design)).toEqual({ ok: false, error: "pay_on_contract_feature" });
  });

  it("rule 4: plan_key is the store plugin's shape ^[a-z0-9][a-z0-9_.-]{0,99}$", () => {
    for (const ok of ["a", "studio_basic", "studio.pro-2", "0day", "a".repeat(100)]) expect(validatePlan({ ...studio, planKey: ok }), ok).toEqual({ ok: true });
    for (const bad of ["", "_x", "-x", ".x", "Studio", "a b", "a/b", "é", "a".repeat(101), "x\n"]) expect(validatePlan({ ...studio, planKey: bad }), JSON.stringify(bad)).toEqual({ ok: false, error: "invalid_plan_key" });
  });

  it("rule 5: a seller's plan is refused by the database (not_editable); the refusal comes back as a code, other errors throw", async () => {
    const owned = rpcClient({ message: "plan_admin:not_editable" });
    expect(await updatePlan({ planKey: "s", productKey: "studio", kind: "base" }, studio.features, studio.limits, who, owned.client)).toBe("not_editable");
    expect(await updatePlan({ planKey: "s", productKey: "studio", kind: "base" }, studio.features, studio.limits, who, rpcClient({ message: "plan_admin:overlaps_plan" }).client)).toBe("overlaps_plan");
    await expect(updatePlan({ planKey: "s", productKey: "studio", kind: "base" }, studio.features, studio.limits, who, rpcClient({ message: "connection reset" }).client)).rejects.toThrow("connection reset");
  });

  it("an invalid plan never reaches the database", async () => {
    const c = rpcClient();
    expect(await createPlan({ ...studio, features: ["video.script"], limits: {} }, who, c.client)).toBe("feature_not_in_product");
    expect(c.rpc).not.toHaveBeenCalled();
    expect(await createPlan(studio, who, c.client)).toBe("saved");
    expect(c.rpc).toHaveBeenCalledWith("plan_admin_create", expect.objectContaining({ p_plan_key: "studio_pro", p_kind: "base", p_actor_role: "owner" }));
  });

  it("the form's ticks become limits: pay only where ticked, other limit keys kept, removed features dropped", () => {
    expect(buildLimits(["studio.image", "studio.fill"], ["studio.image"])).toEqual({ "studio.image": { pay: "credits" } });
    expect(buildLimits(["studio.image"], [], { "studio.image": { pay: "credits", daily: 5 }, "studio.fill": { pay: "credits" } })).toEqual({ "studio.image": { daily: 5 } });
    expect(buildLimits(["studio.image"], ["studio.image"], { "studio.image": { daily: 5 } })).toEqual({ "studio.image": { daily: 5, pay: "credits" } });
  });
});
