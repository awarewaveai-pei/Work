import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { PRODUCTS } from "@/lib/portal/products";

/** Staff manage AwareWave's own plans (/ops/plans; migration 0147). The registry (lib/portal/products.ts) says which
 *  features a product has and which bill in credits; the database only checks structure, so every rule that needs the
 *  registry is here; rules across plans (overlaps_plan) are the database's alone. A saved plan cannot be refused by
 *  can() (invalid_pay_marker) or by the payment function (pack_plan_not_credits, feature_in_another_contract) later.
 *  There is no delete (0147 header). */
export type PlanKind = "base" | "addon";
export const PLAN_KINDS: readonly PlanKind[] = ["base", "addon"];
export const PLAN_KEY = /^[a-z0-9][a-z0-9_.-]{0,99}$/;   // aware-wave-store-plugin PaymentEvents.php KEY

export type PlanLimits = Record<string, Record<string, unknown>>;
export interface PlanInput { planKey: string; productKey: string; kind: string; features: string[]; limits: PlanLimits }
export type PlanCheck = { ok: true } | { ok: false; error: string };

/** Pure. Error codes are the page's message keys. `products` is injectable for tests. */
export function validatePlan(input: PlanInput, products: typeof PRODUCTS = PRODUCTS): PlanCheck {
  const fail = (error: string): PlanCheck => ({ ok: false, error });
  if (!PLAN_KEY.test(input.planKey)) return fail("invalid_plan_key");
  const product = products.find((p) => p.key === input.productKey);
  if (!product) return fail("invalid_product");
  if (!PLAN_KINDS.includes(input.kind as PlanKind)) return fail("invalid_kind");
  if (!input.features.length) return fail("no_features");
  const registered = new Map<string, "credits" | "contract">(product.features.map((f) => [f.feature_key, f.billing]));
  if (new Set(input.features).size !== input.features.length) return fail("feature_not_in_product");
  if (input.features.some((f) => !registered.has(f))) return fail("feature_not_in_product");
  for (const [feature, limit] of Object.entries(input.limits)) {
    if (!input.features.includes(feature) || limit === null || typeof limit !== "object" || Array.isArray(limit)) return fail("invalid_limits");
    if ("pay" in limit && limit.pay !== "credits") return fail("invalid_limits");
    if (limit.pay === "credits" && registered.get(feature) !== "credits") return fail("pay_on_contract_feature");
  }
  if (input.kind === "addon" && input.features.some((f) => input.limits[f]?.pay !== "credits")) return fail("addon_needs_credits");
  return { ok: true };
}

/** The form's ticks -> limits. `credits` = features paid from the wallet. Other keys already on a feature's limits
 *  (`existing`, an edit) are kept; a feature no longer in the plan loses its limits. */
export function buildLimits(features: string[], credits: string[], existing: PlanLimits = {}): PlanLimits {
  const out: PlanLimits = {};
  for (const f of features) {
    const { pay: _pay, ...rest } = existing[f] ?? {};
    const next = credits.includes(f) ? { ...rest, pay: "credits" } : rest;
    if (Object.keys(next).length) out[f] = next;
  }
  return out;
}

export interface PlanRow {
  planKey: string; productKey: string; kind: PlanKind; features: string[]; limits: PlanLimits;
  /** null = AwareWave's plan (editable here); set = a seller's plan (read-only here). */
  ownerOrganizationId: string | null;
}

const PAGE = 1000;   // PostgREST max-rows: a full page is refused, never read as the whole answer

export async function listPlans(client: SupabaseClient | null = getSupabaseWriteClient()): Promise<PlanRow[]> {
  if (!client) throw new Error("entitlements_db_unavailable");
  const { data, error } = await client.from("plans").select("plan_key, product_key, kind, features, limits, owner_organization_id").order("product_key").order("plan_key").limit(PAGE);
  if (error) throw new Error(error.message);
  if ((data ?? []).length >= PAGE) throw new Error("plans_view_truncated");
  const rows = (data ?? []) as Array<{ plan_key: string; product_key: string; kind: PlanKind; features: string[]; limits: PlanLimits; owner_organization_id: string | null }>;
  return rows.map((r) => ({ planKey: r.plan_key, productKey: r.product_key, kind: r.kind, features: r.features, limits: r.limits, ownerOrganizationId: r.owner_organization_id }));
}

/** One stored plan, or null. */
export async function getPlan(planKey: string, client: SupabaseClient | null = getSupabaseWriteClient()): Promise<PlanRow | null> {
  if (!client) throw new Error("entitlements_db_unavailable");
  const { data, error } = await client.from("plans").select("plan_key, product_key, kind, features, limits, owner_organization_id").eq("plan_key", planKey).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { planKey: data.plan_key, productKey: data.product_key, kind: data.kind, features: data.features, limits: data.limits, ownerOrganizationId: data.owner_organization_id } : null;
}

export interface PlanActor { actor: string; actorRole: string }
/** "saved", or a refusal code: ours (validatePlan) or 0147's (plan_admin:<code>). */
export type PlanOutcome = string;

const refusal = (message: string): string | null => /^plan_admin:([a-z_]+)$/.exec(message.trim())?.[1] ?? null;

async function call(client: SupabaseClient | null, fn: string, args: Record<string, unknown>, ok: string): Promise<PlanOutcome> {
  if (!client) throw new Error("entitlements_db_unavailable");
  const { error } = await client.rpc(fn, args);
  if (!error) return ok;
  const code = refusal(error.message);
  if (code) return code;
  throw new Error(error.message);
}

export async function createPlan(input: PlanInput, who: PlanActor, client: SupabaseClient | null = getSupabaseWriteClient()): Promise<PlanOutcome> {
  const check = validatePlan(input);
  if ("error" in check) return check.error;
  return call(client, "plan_admin_create", {
    p_plan_key: input.planKey, p_product_key: input.productKey, p_kind: input.kind, p_features: input.features, p_limits: input.limits,
    p_actor: who.actor, p_actor_role: who.actorRole,
  }, "saved");
}

/** Features and limits only: key, product and kind are fixed once created. `current` is the stored row (kind, product). */
export async function updatePlan(current: Pick<PlanRow, "planKey" | "productKey" | "kind">, features: string[], limits: PlanLimits, who: PlanActor,
  client: SupabaseClient | null = getSupabaseWriteClient()): Promise<PlanOutcome> {
  const check = validatePlan({ planKey: current.planKey, productKey: current.productKey, kind: current.kind, features, limits });
  if ("error" in check) return check.error;
  return call(client, "plan_admin_update", { p_plan_key: current.planKey, p_features: features, p_limits: limits, p_actor: who.actor, p_actor_role: who.actorRole }, "saved");
}
