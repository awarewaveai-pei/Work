import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { PRODUCTS } from "@/lib/portal/products";
import type { CanStore, EntitlementRecord } from "./can";

/** Every registered (product, feature): what an organization_all_features account is granted (ADR 017 §0), topped up by 0118. */
export const registeredFeatures = (products: typeof PRODUCTS = PRODUCTS) =>
  products.flatMap((p) => p.features.map((f) => ({ product_key: p.key, feature_key: f.feature_key })));

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
  endLapsedTrials(now?: Date): Promise<number>;
  ensureAllFeatures(): Promise<number>;
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
    async ensureAllFeatures() {
      const { data, error } = await db.rpc("entitlement_ensure_all_features", { p_features: registeredFeatures() });
      if (error) throw new Error(error.message);
      if (!Number.isSafeInteger(data)) throw new Error("invalid_all_features_count");
      return data as number;
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
    async endLapsedTrials(now = new Date()) {
      // A trial row ends when its own contract grants are gone (portal_complete_signup writes them
      // with source_ref = subscription id), so the 7-day grace lives only in 0110, not here too.
      // Run after expireEntitlements(). Keyset pages: no offset that skips rows as statuses change.
      let ended = 0;
      let after = "00000000-0000-0000-0000-000000000000";
      for (;;) {
        const { data: page, error } = await db.from("organization_product_subscriptions")
          .select("id").eq("status", "trial").lte("current_period_end", now.toISOString())
          .gt("id", after).order("id").limit(TRIAL_PAGE);
        if (error) throw new Error(error.message);
        if (!page?.length) return ended;
        const ids = page.map((row) => row.id as string);
        after = ids[ids.length - 1];
        // One trial has one grant per feature, so a page of trials can exceed PostgREST's row cap:
        // read the live grants in id pages too, or a truncated answer cancels a trial still in grace.
        const stillGranted = new Set<string>();
        let afterGrant = "00000000-0000-0000-0000-000000000000";
        for (;;) {
          const { data: live, error: liveError } = await db.from("organization_entitlements")
            .select("id, source_ref").eq("source", "contract").in("source_ref", ids).in("status", ["active", "suspended"])
            .gt("id", afterGrant).order("id").limit(GRANT_PAGE);
          if (liveError) throw new Error(liveError.message);
          for (const row of live ?? []) stillGranted.add(row.source_ref as string);
          if (!live || live.length < GRANT_PAGE) break;
          afterGrant = live[live.length - 1].id as string;
        }
        const lapsed = ids.filter((id) => !stillGranted.has(id));
        if (lapsed.length) {
          const { error: endError, count } = await db.from("organization_product_subscriptions")
            .update({ status: "canceled", updated_at: now.toISOString() }, { count: "exact" })
            .in("id", lapsed).eq("status", "trial");
          if (endError) throw new Error(endError.message);
          if (count === null) throw new Error("missing_trial_end_count");
          ended += count;
        }
        if (page.length < TRIAL_PAGE) return ended;
      }
    },
  };
}

const TRIAL_PAGE = 200;
const GRANT_PAGE = 500;   // below PostgREST's max-rows (1000), so a full page is never a silent truncation
