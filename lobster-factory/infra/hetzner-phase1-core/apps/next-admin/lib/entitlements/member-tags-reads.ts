// The two reads the member tags need beyond billing_ledger (M3): AwareWave-operated products and live <product>.resell
// rights, one bounded read each. Lives here because entitlement tables are read only under lib/entitlements
// (import-boundary.test.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { isLiveRow } from "./can";

/** What the extra reads add to the ledger: AwareWave-operated products and live <product>.resell rights, by root account. */
export type Extras = { operations: Map<string, Array<{ productKey: string; operatedBy: string }>>; resell: Map<string, Array<{ productKey: string; featureKey: string; source: string; sourceRef: string | null }>>; partial: boolean };
export const NO_EXTRAS: Extras = { operations: new Map(), resell: new Map(), partial: false };
const EXTRA_ROWS_MAX = 1000;
/** Operations and resell rights of every account, two bounded reads. A failure or a full page = the answer says so
 *  (tagsFailed / tagsPartial); the 代操 / 經銷 tags are then missing, never wrong. */
export async function readExtras(supabase: SupabaseClient): Promise<{ extras: Extras; failed: boolean }> {
  const extras: Extras = { operations: new Map(), resell: new Map(), partial: false };
  const ops = await supabase.from("organization_product_operations").select("organization_id,product_key,operated_by")
    .eq("operated_by", "awarewave").limit(EXTRA_ROWS_MAX);
  if (ops.error) return { extras: NO_EXTRAS, failed: true };
  const opRows = (ops.data ?? []) as unknown as Array<{ organization_id?: string; product_key: string; operated_by: string }>;
  for (const r of opRows) if (r.organization_id) extras.operations.set(r.organization_id, [...(extras.operations.get(r.organization_id) ?? []), { productKey: r.product_key, operatedBy: r.operated_by }]);
  const res = await supabase.from("organization_entitlements")
    .select("organization_id,product_key,feature_key,source,source_ref,starts_at,ends_at,status").eq("status", "active").like("feature_key", "%.resell").limit(EXTRA_ROWS_MAX);
  if (res.error) return { extras: NO_EXTRAS, failed: true };
  const now = Date.now() / 1000;
  const resRows = (res.data ?? []) as unknown as Array<{ organization_id?: string; product_key: string; feature_key: string; source: string; source_ref: string | null; starts_at: string; ends_at: string | null; status: string }>;
  for (const r of resRows) {
    if (!r.organization_id) continue;
    const live = isLiveRow({ id: "", organizationId: r.organization_id, productKey: r.product_key, featureKey: r.feature_key, source: "contract", sourceRef: r.source_ref,
      startsAt: Date.parse(r.starts_at) / 1000, endsAt: r.ends_at === null ? null : Date.parse(r.ends_at) / 1000, status: r.status, limits: {} },
      { organizationId: r.organization_id, productKey: r.product_key, featureKey: r.feature_key, now });
    if (live) extras.resell.set(r.organization_id, [...(extras.resell.get(r.organization_id) ?? []), { productKey: r.product_key, featureKey: r.feature_key, source: r.source, sourceRef: r.source_ref }]);
  }
  extras.partial = opRows.length >= EXTRA_ROWS_MAX || resRows.length >= EXTRA_ROWS_MAX;
  return { extras, failed: false };
}

