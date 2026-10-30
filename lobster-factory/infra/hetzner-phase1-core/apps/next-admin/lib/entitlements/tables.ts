import type { JsonValue } from "./permit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { PRODUCTS } from "@/lib/portal/products";
import type { CanStore, EntitlementRecord } from "./can";

/** Every registered (product, feature): what an organization_all_features account is granted (ADR 017 §0), topped up by 0118. */
export const registeredFeatures = (products: typeof PRODUCTS = PRODUCTS) =>
  products.flatMap((p) => p.features.map((f) => ({ product_key: p.key, feature_key: f.feature_key })));

/** Control-plane access only: never give a browser a service-role client. */
type EntitlementRow = { id: string; organization_id: string; product_key: string; feature_key: string; source: "contract" | "comp";
  source_ref: string | null; starts_at: string; ends_at: string | null; status: string; limits: Record<string, JsonValue> };

/** Which of several live rows decides (they arrive oldest first). The row now also decides who pays (can.ts): a row
 *  that covers the use (no `pay: "credits"`) wins over a credit-pack row, so a gift or a contract is never charged to
 *  the wallet because the pack row happens to be older (critic 2026-10-25 M). Among equals the oldest, as before. */
export function pickEntitlementRow<T extends { limits: Record<string, unknown> | null; source: string }>(rows: T[]): T | null {
  // Rank: covers the use (no `pay`) > a valid credit-pack row (contract + "credits") > anything malformed, which can.ts
  // refuses -- so a bad marker never hides a valid row (critic 2026-10-25 second pass M). Oldest first within a rank.
  const rank = (r: T) => (r.limits?.pay === undefined ? 0 : r.limits.pay === "credits" && r.source === "contract" ? 1 : 2);
  let best: T | null = null;
  for (const r of rows) if (best === null || rank(r) < rank(best)) best = r;
  return best;
}

export function createEntitlementStore(client: SupabaseClient | null = getSupabaseWriteClient()): CanStore & {
  expireEntitlements(now?: Date): Promise<number>;
  endLapsedTrials(now?: Date): Promise<number>;
  ensureAllFeatures(): Promise<number>;
} {
  if (!client) throw new Error("entitlements_db_unavailable");
  const db = client;
  return {
    async findActiveEntitlement({ organizationId, productKey, featureKey, now }) {
      const time = new Date(now * 1000).toISOString();
      const { data: rows, error } = await db.from("organization_entitlements")
        .select("id, organization_id, product_key, feature_key, source, source_ref, starts_at, ends_at, status, limits")
        .eq("organization_id", organizationId).eq("product_key", productKey).eq("feature_key", featureKey)
        .eq("status", "active").lte("starts_at", time)
        .or(`ends_at.is.null,ends_at.gt.${time}`).order("created_at").order("id").limit(20);
      if (error) throw new Error(error.message);
      const data = pickEntitlementRow((rows ?? []) as EntitlementRow[]);
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
      // A contract past its period ends when its own grants are gone (portal_complete_signup and 0120's payments write
      // them with source_ref = subscription id), so the 7-day grace lives only in SQL, not here too. Trials and paid
      // contracts alike: a canceled or unrenewed subscription stays open until then (0120), as can() does.
      // Run after expireEntitlements(). Keyset pages: no offset that skips rows as statuses change.
      let ended = 0;
      let after = "00000000-0000-0000-0000-000000000000";
      for (;;) {
        const { data: page, error } = await db.from("organization_product_subscriptions")
          .select("id").in("status", LAPSING).lte("current_period_end", now.toISOString())
          .gt("id", after).order("id").limit(TRIAL_PAGE);
        if (error) throw new Error(error.message);
        if (!page?.length) return ended;
        const ids = page.map((row) => row.id as string);
        after = ids[ids.length - 1];
        // One contract has one grant per feature, so a page of contracts can exceed PostgREST's row cap:
        // read the live grants in id pages too, or a truncated answer cancels a contract still in grace.
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
            // Period re-checked: a payment that renewed the contract since the read above must not be canceled.
            .in("id", lapsed).in("status", LAPSING).lte("current_period_end", now.toISOString());
          if (endError) throw new Error(endError.message);
          if (count === null) throw new Error("missing_trial_end_count");
          ended += count;
        }
        if (page.length < TRIAL_PAGE) return ended;
      }
    },
  };
}

/** One billing account, the 帳務 tab on /ops/clients/<slug> (0127 billing_account; grants grouped, so 300+ feature rows stay one line). */
export interface BillingAccount {
  organization_id: string; name: string; slug: string; kind: "internal" | "customer";
  all_features: { source: string; source_ref: string; note: string | null } | null;
  balance: number;
  hold: { reason: string; since: string } | null;
  contracts: Array<{ id: string; product_key: string; plan_key: string; status: string; started_at: string | null; current_period_end: string | null; source_ref: string | null }>;
  grants: Array<{ product_key: string; source: string; source_ref: string | null; state: string; features: number; ends_at: string | null }>;
  expired_grants: number;
  ledger: Array<{ at: string; units: number; entry_type: string; reference_type: string | null; reference_id: string | null }>;
  payments: Array<{ at: string; provider: string; event_id: string; kind: string; result: Record<string, unknown> | null }>;
}

/** The account an organization bills to (a brand resolves to its root); null = no such organization. */
export async function billingAccount(organizationId: string, client: SupabaseClient | null = getSupabaseWriteClient()): Promise<BillingAccount | null> {
  if (!client) throw new Error("entitlements_db_unavailable");
  const { data, error } = await client.rpc("billing_account", { p_organization_id: organizationId, p_ledger_rows: 20, p_event_rows: 10 });
  if (error) throw new Error(error.message);
  return (data ?? null) as BillingAccount | null;
}

export type AttentionReason = "frozen" | "overdrawn" | "past_due" | "suspended";
export const LEDGER_FILTERS = ["all", "attention", "balance", "contract", "internal"] as const;
export type LedgerFilter = typeof LEDGER_FILTERS[number];
/** /ops/billing (0130 billing_ledger, seller since 0141): totals over every billing account, and one page of the accounts
 *  the filter and query match, each with what the ledger shows without opening the account and who sold it (sold_by =
 *  the seller's name; an account sold by AwareWave, sold_by_organization_id null, names the internal account). */
export interface BillingLedger {
  totals: { accounts: number; unused_units: number; unused_accounts: number; granted_30d: number; spent_30d: number; attention: number }
    & Record<AttentionReason, number>;
  matching: number;
  rows: Array<{
    organization_id: string; name: string; slug: string; kind: "internal" | "customer";
    balance: number; granted_30d: number; spent_30d: number; frozen_since: string | null; reasons: AttentionReason[];
    contracts: Array<{ product_key: string; plan_key: string; status: string; current_period_end: string | null }>;
    next_period_end: string | null;
    last_payment: { at: string; kind: string; provider: string } | null;
    sold_by_id: string; sold_by: string | null;
  }>;
}

/** seller = an organization id: only the accounts that seller sold (0141 'seller:<uuid>'), in place of the filter. */
export async function billingLedger(
  opts: { filter: LedgerFilter; seller?: string; query: string; limit: number; offset: number },
  client: SupabaseClient | null = getSupabaseWriteClient(),
): Promise<BillingLedger> {
  if (!client) throw new Error("entitlements_db_unavailable");
  const { data, error } = await client.rpc("billing_ledger", {
    p_filter: opts.seller ? `seller:${opts.seller}` : opts.filter, p_query: opts.query, p_limit: opts.limit, p_offset: opts.offset,
  });
  if (error) throw new Error(error.message);
  if (!data || !Array.isArray((data as BillingLedger).rows)) throw new Error("invalid_billing_ledger");
  return data as BillingLedger;
}

/** ADR 017 #12 D4: what each seller sold in one Asia/Taipei month, for the invoice staff send outside the control plane. */
export interface SellerMonth {
  month: string;
  rows: Array<{ seller_id: string; seller: string; subscription_payments: number; credit_pack_orders: number; credit_pack_units: number }>;
}

/** The Asia/Taipei calendar month a date falls in, as its first day (the month 0141 billing_seller_month sums by). */
export const taipeiMonthStart = (now: Date = new Date()): string =>
  `${now.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }).slice(0, 7)}-01`;

/** The first day of the month before a month start ('2026-01-01' -> '2025-12-01'). */
export const previousMonthStart = (monthStart: string): string => {
  const [y, m] = monthStart.split("-").map(Number);
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
};

/** A month's seller totals stop changing once the 7-day paid_at window after it has passed (0142): on the 8th of the
 *  next month, Asia/Taipei. Returns that day ('2026-10-08' for '2026-09-01'); before it, no invoice from that month. */
export const sellerMonthFinalFrom = (monthStart: string): string => {
  const [y, m] = monthStart.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-08` : `${y}-${String(m + 1).padStart(2, "0")}-08`;
};

export async function billingSellerMonth(month: string, client: SupabaseClient | null = getSupabaseWriteClient()): Promise<SellerMonth> {
  if (!client) throw new Error("entitlements_db_unavailable");
  const { data, error } = await client.rpc("billing_seller_month", { p_month: month });
  if (error) throw new Error(error.message);
  if (!data || !Array.isArray((data as SellerMonth).rows)) throw new Error("invalid_billing_seller_month");
  return data as SellerMonth;
}

const TRIAL_PAGE = 200;
const LAPSING = ["trial", "active", "past_due"];
const GRANT_PAGE = 500;   // below PostgREST's max-rows (1000), so a full page is never a silent truncation
