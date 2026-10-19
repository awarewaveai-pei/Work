import { PRODUCTS } from "@/lib/portal/products";
import { signPermit, type JsonValue, type PermitBinding, type PermitKey, type PermitPayload } from "./permit";
export { verifyPermit } from "./permit";

export interface EntitlementRecord {
  id: string;
  organizationId: string;
  productKey: string;
  featureKey: string;
  source: "contract" | "comp";
  sourceRef: string | null;
  startsAt: number;
  endsAt: number | null;
  status: string;
  limits: Record<string, JsonValue>;
}
export interface CanStore {
  findActiveEntitlement(input: { organizationId: string; productKey: string; featureKey: string; now: number }): Promise<EntitlementRecord | null>;
  getCreditBalance(organizationId: string): Promise<number>;
}
export interface CanDependencies {
  store: CanStore;
  key: { kid: string; privateKey: PermitKey };
  now?: () => number;
  creditPolicy?: (productKey: string, featureKey: string) => Promise<{ minimumCharge: number; singleLimit: number } | null>;
}
export type CanResult = { allowed: true; payload: PermitPayload; permit: string } | { allowed: false; reason: string };

/** Internal control-plane primitive. Store, policy and actor/tenant authorization are trusted server dependencies.
 * Callers resolve authenticated actor and billing tenant first; never expose this signer as a public HTTP endpoint.
 */
export async function can(request: PermitBinding, deps: CanDependencies): Promise<CanResult> {
  const deny = (reason: string): CanResult => ({ allowed: false, reason });
  const feature = PRODUCTS.find((p) => p.key === request.product_key)?.features.find((f) => f.feature_key === request.feature_key);
  if (!feature) return deny("unknown_feature");
  if (!request.tenant || !request.actor || request.on_behalf_of !== request.tenant) return deny("invalid_subject");
  const now = deps.now?.() ?? Math.floor(Date.now() / 1000);
  let details: Pick<PermitPayload, "source" | "source_ref" | "entitlement_id" | "limits" | "max_spend">;
  let expiresAt = now + 600;
  if (feature.billing === "credits") {
    const policy = await deps.creditPolicy?.(request.product_key, request.feature_key);
    if (!policy || !Number.isFinite(policy.minimumCharge) || policy.minimumCharge <= 0 || !Number.isFinite(policy.singleLimit) || policy.singleLimit < policy.minimumCharge) return deny("missing_credit_policy");
    const balance = await deps.store.getCreditBalance(request.tenant);
    if (!Number.isFinite(balance) || balance < policy.minimumCharge) return deny("insufficient_credits");
    details = { source: "credits", source_ref: null, entitlement_id: null, limits: {}, max_spend: Math.min(balance, policy.singleLimit) };
  } else {
    const row = await deps.store.findActiveEntitlement({ organizationId: request.tenant, productKey: request.product_key, featureKey: request.feature_key, now });
    if (!row || row.status !== "active" || row.organizationId !== request.tenant || row.productKey !== request.product_key || row.featureKey !== request.feature_key || !Number.isFinite(row.startsAt) || row.startsAt > now || (row.endsAt !== null && (!Number.isFinite(row.endsAt) || row.endsAt <= now))) return deny("no_active_entitlement");
    // Do not let a cached permit extend an entitlement's own deadline.
    expiresAt = Math.min(expiresAt, row.endsAt === null ? expiresAt : Math.floor(row.endsAt));
    if (expiresAt <= now) return deny("no_active_entitlement");
    details = { source: row.source, source_ref: row.sourceRef, entitlement_id: row.id, limits: row.limits, max_spend: null };
  }
  const payload: PermitPayload = { ...request, ...details, format_version: 1, issued_at: now, expires_at: expiresAt, kid: deps.key.kid };
  return { allowed: true, payload, permit: signPermit(payload, deps.key.privateKey) };
}
