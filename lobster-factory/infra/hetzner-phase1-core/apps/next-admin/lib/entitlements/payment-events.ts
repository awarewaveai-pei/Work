// Read side of payment_events for reconciliation (lib/payments/woo-reconcile.ts): one cash-register site's order-kind
// events (a subscription payment, a credit pack) and refunds received since a time. Writes go only through 0120
// billing_apply_payment_event.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface OrderEventRow { event_id: string; kind: string; payload: Record<string, unknown>; received_at: string }
export const ORDER_EVENT_KINDS = ["subscription_paid", "credit_pack"] as const;
const READ_KINDS = [...ORDER_EVENT_KINDS, "refund"];
const LIMIT = 5000;

export async function siteOrderEvents(db: SupabaseClient, siteId: string, sinceIso: string): Promise<OrderEventRow[]> {
  const { data, error } = await db.from("payment_events").select("event_id, kind, payload, received_at")
    .eq("provider", "woo").eq("site_id", siteId).in("kind", READ_KINDS).gte("received_at", sinceIso).order("received_at").limit(LIMIT);
  if (error) throw new Error(`payment_events:${error.message}`);
  // A cut-off list would show payments as missing: refuse instead of answering partly.
  if ((data ?? []).length >= LIMIT) throw new Error("payment_events:too_many_to_reconcile");
  return (data ?? []) as OrderEventRow[];
}
