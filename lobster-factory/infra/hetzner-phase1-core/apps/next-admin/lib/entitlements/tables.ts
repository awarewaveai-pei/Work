import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import type { CanStore, EntitlementRecord } from "./can";

// A product can have more than one non-canceled plan (the migration's unique
// key includes plan_key). Keep the launcher state deterministic when a base
// plan and an add-on coexist, and prefer the state that grants access.
const SUBSCRIPTION_STATUS_PRIORITY: Record<string, number> = {
  active: 4,
  trial: 3,
  past_due: 2,
  suspended: 1,
  canceled: 0,
};

/** Control-plane access only: never give a browser a service-role client. */
export function createEntitlementStore(client: SupabaseClient | null = getSupabaseWriteClient()): CanStore & {
  expireEntitlements(now?: Date): Promise<number>;
  getSubscriptionStatuses(organizationId: string): Promise<Map<string, string>>;
} {
  if (!client) throw new Error("entitlements_db_unavailable");
  const db = client;
  return {
    async findActiveEntitlement({ organizationId, productKey, featureKey, now }) {
      const time = new Date(now * 1000).toISOString();
      const { data, error } = await db.from("organization_entitlements")
        .select("id, organization_id, product_key, feature_key, source, source_ref, starts_at, ends_at, status, limits")
        .eq("organization_id", organizationId).eq("product_key", productKey).eq("feature_key", featureKey)
        .eq("status", "active").lte("starts_at", time)
        .or(`ends_at.is.null,ends_at.gt.${time}`).order("created_at").order("id").limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        id: data.id, organizationId: data.organization_id, productKey: data.product_key,
        featureKey: data.feature_key, source: data.source, sourceRef: data.source_ref,
        startsAt: Date.parse(data.starts_at) / 1000,
        endsAt: data.ends_at === null ? null : Date.parse(data.ends_at) / 1000,
        status: data.status, limits: data.limits,
      } satisfies EntitlementRecord;
    },
    async getCreditBalance(organizationId) {
      // Aggregate in Postgres; selecting ledger rows truncates at PostgREST's row cap.
      const { data, error } = await db.rpc("entitlement_credit_balance", { p_organization_id: organizationId });
      if (error) throw new Error(error.message);
      const balance = Number(data);
      if (data === null || !Number.isFinite(balance)) throw new Error("invalid_credit_balance");
      return balance;
    },
    async getSubscriptionStatuses(organizationId) {
      const { data, error } = await db.from("organization_product_subscriptions")
        .select("product_key, status, plan_key").eq("organization_id", organizationId)
        .order("product_key").order("plan_key");
      if (error) throw new Error(error.message);
      const byProduct = new Map<string, string>();
      for (const row of data ?? []) {
        const current = byProduct.get(row.product_key);
        if (!current || (SUBSCRIPTION_STATUS_PRIORITY[row.status] ?? -1) > (SUBSCRIPTION_STATUS_PRIORITY[current] ?? -1)) {
          byProduct.set(row.product_key, row.status);
        }
      }
      return byProduct;
    },
    async expireEntitlements(now = new Date()) {
      // UPDATE all matching rows; no SELECT/pagination that can skip accounts past row 1000.
      const { error, count } = await db.from("organization_entitlements")
        .update({ status: "expired" }, { count: "exact" })
        .in("status", ["active", "suspended"]).lte("ends_at", now.toISOString());
      if (error) throw new Error(error.message);
      if (count === null) throw new Error("missing_expiry_count");
      return count;
    },
  };
}
