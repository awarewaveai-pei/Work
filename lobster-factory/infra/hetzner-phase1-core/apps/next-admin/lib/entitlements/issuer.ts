import { PRODUCTS } from "@/lib/portal/products";
import { issuePermit, type GateDependencies } from "./can";
import { supabaseSubjectStore, type SubjectStore } from "./subject";

// Permit issuer for a separate product service (ADR 017 §3): the cognitive API asks here, verifies the answer locally
// with ENTITLEMENT_PUBLIC_KEYS and binds it to its own (billing account, feature, actor). One bearer per product: the
// token can only mint permits for that product's features and actors spelled `<product>:<id>`.

export const ISSUER_TOKENS: Readonly<Record<string, string>> = { cognitive: "ENTITLEMENT_ISSUER_TOKEN_COGNITIVE" };

const REASONS: Record<string, string> = { no_active_entitlement: "no_entitlement", insufficient_credits: "no_credits" };
type Answer = { status: number; body: { allowed: true; permit: string } | { allowed: false; reason: string } };

export async function issueForService(productKey: string, input: unknown, deps: GateDependencies, subjects?: SubjectStore): Promise<Answer> {
  const refuse = (status: number, reason: string): Answer => ({ status, body: { allowed: false, reason } });
  const body = (input ?? {}) as Record<string, unknown>;
  const { organization_id: org, feature_key: featureKey, actor } = body;
  if (typeof org !== "string" || !org || typeof featureKey !== "string" || typeof actor !== "string") return refuse(400, "invalid_request");
  if (!actor.startsWith(`${productKey}:`) || actor.length <= productKey.length + 1) return refuse(400, "actor_outside_product");
  if (!PRODUCTS.find((p) => p.key === productKey)?.features.some((f) => f.feature_key === featureKey)) return refuse(400, "feature_outside_product");
  try {
    const store = subjects ?? supabaseSubjectStore();
    const row = await store.byId(org);
    if (!row) return refuse(404, "organization_not_found");
    // The caller binds the permit to the id it sent; a child org would be re-rooted here and never match.
    if (row.parent_organization_id) return refuse(400, "not_billing_account");
    const issued = await issuePermit({ tenant: org, product_key: productKey, feature_key: featureKey, actor, on_behalf_of: org }, await deps.permit());
    if (issued.allowed === false) return refuse(200, REASONS[issued.reason] ?? issued.reason);
    return { status: 200, body: { allowed: true, permit: issued.permit } };
  } catch (error) {
    console.warn(`[entitlement] issuer failed: ${String(error).slice(0, 200)}`);
    return refuse(503, "infrastructure_error");
  }
}
