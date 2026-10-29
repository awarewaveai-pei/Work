import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import type { PaymentProviderName, ReceivedPayment } from "@/lib/payments";

// The only writer of payment-driven contracts, grants and wallet entries (ADR 017 step 4). The whole state machine
// is one Postgres function (0120 billing_apply_payment_event), so the inbox row, contract, grants and ledger entry
// commit or roll back together; this file only carries the event there and names the outcome.

export type PaymentOutcome =
  | { ok: true; replayed: true; event: string }
  | { ok: true; replayed?: false; event: string; kind: string; [detail: string]: unknown }
  | { ok: false; status: 409 | 422; code: string };

/** Rejections the caller should not retry unchanged; anything else is an infrastructure error and throws. */
const CONFLICT = new Set(["event_id_reused", "account_frozen"]);

export async function applyPaymentEvent(provider: PaymentProviderName, received: ReceivedPayment,
  client: SupabaseClient | null = getSupabaseWriteClient()): Promise<PaymentOutcome> {
  if (!client) throw new Error("payments_db_unavailable");
  const { data, error } = await client.rpc("billing_apply_payment_event", {
    p_provider: provider, p_event_id: received.eventId, p_event: received.event, p_site_id: received.siteId ?? null,
  });
  if (error) {
    const code = /payment_rejected:([a-z_]+)/.exec(error.message)?.[1];
    if (code) return { ok: false, status: CONFLICT.has(code) ? 409 : 422, code };
    throw new Error(error.message);
  }
  if (!data || typeof data !== "object" || (data as { ok?: unknown }).ok !== true) throw new Error("invalid_payment_result");
  return data as PaymentOutcome;
}
