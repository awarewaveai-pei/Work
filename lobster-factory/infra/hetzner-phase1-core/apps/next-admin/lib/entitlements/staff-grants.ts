import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { PRODUCTS } from "@/lib/portal/products";
import { sellerLicenceKey } from "./can";

/** Staff give / take a product on the client hub (ADR 017 4b-10; migration 0143). `use` = comp rows for every
 *  registered feature of the product (who may use it); `resell` = the <product>.resell licence (who may sell it,
 *  sellerMaySell). Two separate gifts: one never writes or ends the other's rows. Comp only: a contract row 0120 does
 *  not own would block the customer's own payment for the feature (0143 header). */
export type StaffGrantKind = "use" | "resell";
export const STAFF_GRANT_KINDS: readonly StaffGrantKind[] = ["use", "resell"];

/** What a gift of `kind` writes for a product: the registry's features, or the one licence. Empty = nothing to give. */
export function staffGrantFeatures(productKey: string, kind: StaffGrantKind, products: typeof PRODUCTS = PRODUCTS): string[] {
  const product = products.find((p) => p.key === productKey);
  if (!product) return [];
  return kind === "resell" ? [sellerLicenceKey(product.key)] : product.features.map((f) => f.feature_key);
}

/** One product's live rows on the account, as the hub shows them. staff = rows this page wrote (source_ref staff:%);
 *  gifts = those rows' source_refs, which the page sends back so taking back ends only the gifts it showed. */
export interface StaffGrantProduct {
  key: string; name: string; features: number;
  use: { staff: number; other: number; gifts: string[] };
  resell: { staff: boolean; other: boolean; gifts: string[] };
}

type LiveRow = { product_key: string; feature_key: string; source_ref: string | null };
const isStaff = (r: LiveRow) => (r.source_ref ?? "").startsWith("staff:");
const giftsOf = (rows: LiveRow[]) => [...new Set(rows.filter(isStaff).map((r) => r.source_ref as string))].sort();

/** Pure: live rows -> one line per registered product. */
export function summarizeStaffGrants(rows: LiveRow[], products: typeof PRODUCTS = PRODUCTS): StaffGrantProduct[] {
  return products.map((p) => {
    const mine = rows.filter((r) => r.product_key === p.key);
    const licence = sellerLicenceKey(p.key);
    const use = mine.filter((r) => r.feature_key !== licence);
    const resell = mine.filter((r) => r.feature_key === licence);
    return {
      key: p.key, name: p.name, features: p.features.length,
      use: { staff: use.filter(isStaff).length, other: use.filter((r) => !isStaff(r)).length, gifts: giftsOf(use) },
      resell: { staff: resell.some(isStaff), other: resell.some((r) => !isStaff(r)), gifts: giftsOf(resell) },
    };
  });
}

const PAGE = 1000;   // PostgREST max-rows: a full page is refused, never read as the whole answer

/** The account's live rows except all-features ones (an all-features account cannot take a use gift; 0118 rows are
 *  one per feature of every product and would only crowd the read). */
export async function staffGrantView(accountId: string, client: SupabaseClient | null = getSupabaseWriteClient()): Promise<StaffGrantProduct[]> {
  if (!client) throw new Error("entitlements_db_unavailable");
  const now = new Date().toISOString();
  const { data, error } = await client.from("organization_entitlements").select("product_key, feature_key, source_ref")
    .eq("organization_id", accountId).in("status", ["active", "suspended"]).lte("starts_at", now).or(`ends_at.is.null,ends_at.gt.${now}`)
    .or("source_ref.is.null,source_ref.not.like.all-features:*").limit(PAGE);
  if (error) throw new Error(error.message);
  if ((data ?? []).length >= PAGE) throw new Error("staff_grant_view_truncated");
  return summarizeStaffGrants((data ?? []) as LiveRow[]);
}

/** sourceRefs: taking back only -- the staff:% gifts the page showed (a gift made since by someone else stays). */
export interface StaffGrantChange { accountId: string; productKey: string; kind: StaffGrantKind; actor: string; actorRole: string; note: string; sourceRefs?: string[] }
/** given / already (every feature already live) / taken / nothing_to_take, or a refusal code from 0143 (staff_grant:<code>). */
export type StaffGrantOutcome = "given" | "already" | "taken" | "nothing_to_take" | string;

const refusal = (message: string): string | null => /^staff_grant:([a-z_]+)$/.exec(message.trim())?.[1] ?? null;

export async function giveProduct(change: StaffGrantChange, client: SupabaseClient | null = getSupabaseWriteClient()): Promise<StaffGrantOutcome> {
  if (!client) throw new Error("entitlements_db_unavailable");
  const features = staffGrantFeatures(change.productKey, change.kind);
  if (!features.length) return "no_features";
  const { data, error } = await client.rpc("entitlement_staff_grant", {
    p_organization_id: change.accountId, p_product_key: change.productKey, p_kind: change.kind, p_features: features,
    p_actor: change.actor, p_actor_role: change.actorRole, p_note: change.note,
  });
  if (error) {
    const code = refusal(error.message);
    if (code) return code;
    throw new Error(error.message);
  }
  return Number((data as { added?: unknown } | null)?.added) > 0 ? "given" : "already";
}

export async function takeProduct(change: StaffGrantChange, client: SupabaseClient | null = getSupabaseWriteClient()): Promise<StaffGrantOutcome> {
  if (!client) throw new Error("entitlements_db_unavailable");
  if (!PRODUCTS.some((p) => p.key === change.productKey)) return "no_features";
  if (!change.sourceRefs?.length) return "nothing_to_take";
  const { data, error } = await client.rpc("entitlement_staff_revoke", {
    p_organization_id: change.accountId, p_product_key: change.productKey, p_kind: change.kind, p_source_refs: change.sourceRefs,
    p_actor: change.actor, p_actor_role: change.actorRole, p_note: change.note,
  });
  if (error) {
    const code = refusal(error.message);
    if (code) return code;
    throw new Error(error.message);
  }
  return Number((data as { ended?: unknown } | null)?.ended) > 0 ? "taken" : "nothing_to_take";
}
