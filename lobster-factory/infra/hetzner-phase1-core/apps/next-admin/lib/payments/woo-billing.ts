// `woo` payments (ADR 017 step 4b, cards/step-4.md 4b-3): the wp-bridge plugin on aware-wave.com turns WooCommerce /
// WooCommerce Subscriptions actions into one PaymentEvent and POSTs it here. Not Woo's native webhook (no renewal topic,
// disabled after 5 failures). Signature = the `local` construction keyed by PAYMENTS_WOO_SECRET (lib/payments/hmac.ts).
// Body = {event_id, wp_user_id, email, email_verified, display_name?, ...PaymentEvent without organization_id}; email_verified
// = the plugin proved the member owns the address (WooCommerce does not); a first payment without it makes no account.: WordPress names the
// member, never our account id; the account is resolved (or created on a first payment) by lib/entitlements/wp-customers.
// `lib/payments/woo.ts` is the unrelated wp-bridge WRITE client.
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/accounts/client-invite";
import { ingestIncident } from "@/lib/ops-inbox/ingest";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { ensureWpCustomer, WpCustomerRefused } from "@/lib/entitlements/wp-customers";
import { PAYMENT_SIGNATURE_HEADER, verifyPayment } from "./hmac";
import { PaymentParseError, toPaymentEvent, type PaymentProvider, type ReceivedPayment } from "./provider";

/** A signed event we refuse for good: the shop has usually taken the money, and the sender will not retry, so the
 *  operator must hear of it (critic 2026-10-25 M). No email or body in the incident; the event id finds the order. */
async function raiseRefusal(db: SupabaseClient | null, eventId: string, code: string, detail: Record<string, unknown>): Promise<void> {
  console.error(`[payments] woo event refused event_id=${eventId} code=${code}`);
  if (!db) return;
  const fingerprint = `payments:woo:refused:${eventId}`;
  const res = await ingestIncident(db, {
    source: "payments", external_id: fingerprint, fingerprint, signal_type: "error", severity: "high", service: "payments-woo",
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    title: "WooCommerce 付款事件被拒，需要人工對帳", message: `event ${eventId}: ${code}`,
    raw: { event_id: eventId, code, ...detail }, tags: { product: "billing" }, client_slug: null,
  });
  if (res.error) console.error(`[payments] refusal incident not written: ${res.error}`);
}

export interface WooBillingDeps {
  ensureCustomer: typeof ensureWpCustomer;
  db: () => ReturnType<typeof getSupabaseWriteClient>;
  alert: typeof raiseRefusal;
}
const DEFAULT_DEPS: WooBillingDeps = { ensureCustomer: ensureWpCustomer, db: getSupabaseWriteClient, alert: raiseRefusal };
/** Only a payment may create an account (wp-customers.ts ensureWpCustomer). */
const PAYMENT_KINDS = new Set(["subscription_paid", "credit_pack"]);
const EVENT_ID = /^[\w.:\-/#]{1,200}$/;

export function wooBillingProvider(env: Record<string, string | undefined>, deps: WooBillingDeps = DEFAULT_DEPS): PaymentProvider {
  return {
    name: "woo",
    verify: (headers, rawBody) => verifyPayment(rawBody, headers.get(PAYMENT_SIGNATURE_HEADER), env.PAYMENTS_WOO_SECRET),
    parse: (rawBody) => parseWoo(rawBody, deps),
    async refused(rawBody, code) {
      // Only what the request names, checked: the event id by the same pattern parse uses, kind only as a short word.
      let eventId = "unknown";
      let detail: Record<string, unknown> = {};
      try {
        const o = JSON.parse(rawBody) as Record<string, unknown>;
        if (typeof o.event_id === "string" && EVENT_ID.test(o.event_id)) eventId = o.event_id;
        detail = { wp_user_id: Number.isSafeInteger(o.wp_user_id) ? o.wp_user_id : null, kind: typeof o.kind === "string" && /^[a-z_]{1,40}$/.test(o.kind) ? o.kind : null };
      } catch { /* the code says invalid_json */ }
      await deps.alert(deps.db(), eventId, code, detail);
    },
  };
}

async function parseWoo(rawBody: string, deps: WooBillingDeps): Promise<ReceivedPayment> {
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { throw new PaymentParseError("invalid_json"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new PaymentParseError("not_an_object");
  const { event_id: eventId, wp_user_id: wpUserId, email: rawEmail, email_verified: emailVerified, display_name: displayName, ...rest } = body as Record<string, unknown>;
  if (typeof eventId !== "string" || !EVENT_ID.test(eventId)) throw new PaymentParseError("invalid_event_id");
  if ("organization_id" in rest) throw new PaymentParseError("organization_id_not_allowed");
  // Guest checkout has no member to bill: aware-wave.com requires an account at checkout (cards/step-4.md 4b-6).
  if (wpUserId === 0 || wpUserId === undefined || wpUserId === null) throw new PaymentParseError("guest_checkout");
  if (!Number.isSafeInteger(wpUserId) || (wpUserId as number) < 1) throw new PaymentParseError("invalid_wp_user_id");
  const email = normalizeEmail(rawEmail);
  if (!email) throw new PaymentParseError("invalid_email");
  if (displayName !== undefined && displayName !== null && (typeof displayName !== "string" || displayName.length > 200)) {
    throw new PaymentParseError("invalid_display_name");
  }
  // Shape first: a malformed event never creates an account.
  toPaymentEvent({ ...rest, organization_id: "00000000-0000-4000-8000-000000000000" });
  const db = deps.db();
  if (!db) throw new Error("payments_db_unavailable");
  let organizationId: string;
  try {
    ({ organizationId } = await deps.ensureCustomer(db, { wpUserId: wpUserId as number, email, displayName: displayName as string | null | undefined, emailVerified: emailVerified === true },
      typeof rest.plan_key === "string" ? rest.plan_key : undefined, PAYMENT_KINDS.has(String(rest.kind))));
  } catch (error) {
    if (error instanceof WpCustomerRefused) throw new PaymentParseError(error.code);
    throw error;
  }
  return { eventId, event: toPaymentEvent({ ...rest, organization_id: organizationId }) };
}
