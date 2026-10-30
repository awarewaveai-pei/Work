"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { canWriteTenantConfig, readOpsRole } from "@/lib/ops-role";
import { requestActor } from "@/lib/entitlements/subject";
import { buildLimits, createPlan, getPlan, updatePlan } from "@/lib/entitlements/plans-admin";
import { PRODUCTS } from "@/lib/portal/products";

const text = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
};

/** Every feature of every registered product the form ticked: `f:<key>` = in the plan, `c:<key>` = paid from the wallet. */
const ticked = (form: FormData, prefix: "f" | "c") =>
  PRODUCTS.flatMap((p) => p.features.map((f) => f.feature_key)).filter((k) => form.get(`${prefix}:${k}`) === "on");

/** Plans decide what a payment grants: owner or admin only. Returns the redirect code. */
async function outcome(run: (who: { actor: string; actorRole: string }) => Promise<string>): Promise<string> {
  const h = await headers();
  const req = new Request("http://localhost", { headers: h });
  const role = readOpsRole(req);
  if (!canWriteTenantConfig(role)) return "forbidden";
  try {
    return await run({ actor: requestActor(req), actorRole: role });
  } catch (e) {
    console.error(`[plans-admin] ${e instanceof Error ? e.message : String(e)}`);
    return "db_unavailable";
  }
}

function done(code: string, plan: string): never {
  revalidatePath("/ops/plans");
  redirect(`/ops/plans?r=${encodeURIComponent(code)}&p=${encodeURIComponent(plan)}`);
}

export async function addPlan(form: FormData) {
  const planKey = text(form, "plan_key").trim();
  const features = ticked(form, "f");
  const code = await outcome((who) => createPlan({ planKey, productKey: text(form, "product"), kind: text(form, "kind"), features, limits: buildLimits(features, ticked(form, "c")) }, who));
  done(code, planKey);
}

export async function savePlan(form: FormData) {
  const planKey = text(form, "plan_key");
  const features = ticked(form, "f");
  const code = await outcome(async (who) => {
    const current = await getPlan(planKey);
    if (!current) return "not_found";
    if (current.ownerOrganizationId) return "not_editable";
    return updatePlan(current, features, buildLimits(features, ticked(form, "c"), current.limits), who);
  });
  done(code, planKey);
}
