// `woo` payments (ADR 017 step 4b, cards/step-4.md 4b-3): the wp-bridge plugin on aware-wave.com turns WooCommerce /
// WooCommerce Subscriptions actions into one PaymentEvent and POSTs it here. Not Woo's native webhook (no renewal topic,
// disabled after 5 failures). Any cash-register site may send (4c-2): header X-AwareWave-Site names its seller_sites
// key id, and that row's own key verifies the signature (lib/payments/sites.ts); no header = aware-wave.com, whose row
// is the `local` HMAC construction keyed by PAYMENTS_WOO_SECRET (lib/payments/hmac.ts), so today's plugin is unchanged.
// Body = {event_id, wp_user_id, email, email_verified, display_name?, ...PaymentEvent without organization_id}; email_verified
// = the plugin proved the member owns the address (WooCommerce does not); a first payment without it makes no account.: WordPress names the
// member, never our account id; the account is resolved (or created on a first payment) by lib/entitlements/wp-customers.
// `lib/payments/woo.ts` is the unrelated wp-bridge WRITE client.
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/accounts/client-invite";
import { ingestIncident } from "@/lib/ops-inbox/ingest";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { ensureWpCustomer, WpCustomerRefused } from "@/lib/entitlements/wp-customers";
import { PAYMENT_SIGNATURE_HEADER, PAYMENT_SITE_HEADER } from "./hmac";
import { eventPlanKeys, PaymentParseError, toPaymentEvent, type PaymentProvider, type ReceivedPayment, type VerifiedSender } from "./provider";
import { AWARE_WAVE_KEY_ID, findSiteByKeyId, siteMaySellPlan, siteNamespace, verifySiteSignature, type SellerSite } from "./sites";

/** A signed event we refuse for good: the shop has usually taken the money, and the sender will not retry, so the
 *  operator must hear of it (critic 2026-10-25 M). No email or body in the incident; the event id finds the order. */
async function raiseRefusal(db: SupabaseClient | null, ns: string, eventId: string, code: string, detail: Record<string, unknown>): Promise<void> {
  console.error(`[payments] ${ns} event refused event_id=${eventId} code=${code}`);
  if (!db) return;
  // ns = the site's namespace (sites.ts siteNamespace): two shops both send event 7, and they are two incidents.
  const fingerprint = `payments:${ns}:refused:${eventId}`;
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
  site: typeof findSiteByKeyId;
  maySell: typeof siteMaySellPlan;
}
const DEFAULT_DEPS: WooBillingDeps = {
  ensureCustomer: ensureWpCustomer, db: getSupabaseWriteClient, alert: raiseRefusal, site: findSiteByKeyId, maySell: siteMaySellPlan,
};
/** Only a payment may create an account (wp-customers.ts ensureWpCustomer). */
const PAYMENT_KINDS = new Set(["subscription_paid", "credit_pack"]);
const EVENT_ID = /^[\w.:\-/#]{1,200}$/;
/** What another seller's site may be told about its own member; any other account refusal (whose account an email is:
 *  staff, another seller's customer, ...) reaches it only as customer_refused, the detail goes to the incident. */
const SITE_LOCAL_REFUSALS = new Set(["unknown_member", "email_unverified", "unknown_plan"]);

export function wooBillingProvider(env: Record<string, string | undefined>, deps: WooBillingDeps = DEFAULT_DEPS): PaymentProvider {
  return {
    name: "woo",
    async verify(headers, rawBody) {
      const signature = headers.get(PAYMENT_SIGNATURE_HEADER);
      if (!signature) return null;
      // The site is named by the header and proven by its own key; the body never chooses it (invariant 1).
      const named = headers.get(PAYMENT_SITE_HEADER);
      const db = deps.db();
      if (!db) throw new Error("payments_db_unavailable");
      const site = await deps.site(db, named === null ? AWARE_WAVE_KEY_ID : named.trim());
      return site && verifySiteSignature(site, "payment", rawBody, signature, env) ? { site } : null;
    },
    parse: (rawBody, sender) => parseWoo(rawBody, signingSite(sender), deps),
    async refused(rawBody, code, sender) {
      // Only what the request names, checked: the event id by the same pattern parse uses, kind only as a short word.
      let eventId = "unknown";
      let detail: Record<string, unknown> = {};
      try {
        const o = JSON.parse(rawBody) as Record<string, unknown>;
        if (typeof o.event_id === "string" && EVENT_ID.test(o.event_id)) eventId = o.event_id;
        detail = { wp_user_id: Number.isSafeInteger(o.wp_user_id) ? o.wp_user_id : null, kind: typeof o.kind === "string" && /^[a-z_]{1,40}$/.test(o.kind) ? o.kind : null };
      } catch { /* the code says invalid_json */ }
      const site = sender.site;
      await deps.alert(deps.db(), siteNamespace("woo", site ?? { keyId: "unknown-site" }), eventId, code, { ...detail, site: site?.keyId ?? null });
    },
  };
}

function signingSite(sender: VerifiedSender): SellerSite {
  if (!sender.site) throw new Error("woo_sender_without_site");   // verify() always names one; parse never guesses
  return sender.site;
}

async function parseWoo(rawBody: string, site: SellerSite, deps: WooBillingDeps): Promise<ReceivedPayment> {
  // Signed by the site's own key, but the site is closed (a leaked key, a seller who stopped): the shop may have taken
  // the money, so this is a refusal with an incident (refused()), never a silent 401 (critic 2026-10-29 M2).
  if (site.status !== "active") throw new PaymentParseError("site_disabled");
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { throw new PaymentParseError("invalid_json"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new PaymentParseError("not_an_object");
  const { event_id: eventId, wp_user_id: wpUserId, email: rawEmail, email_verified: emailVerified, display_name: displayName, ...rest } = body as Record<string, unknown>;
  if (typeof eventId !== "string" || !EVENT_ID.test(eventId)) throw new PaymentParseError("invalid_event_id");
  if ("organization_id" in rest) throw new PaymentParseError("organization_id_not_allowed");
  if ("site_id" in rest || "seller_organization_id" in rest) throw new PaymentParseError("seller_not_allowed");
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
  const plans = eventPlanKeys(rest);
  const planKey = plans[0];   // the door a set-password mail names (wp-customers.ts inviteProductKey)
  const isPayment = PAYMENT_KINDS.has(String(rest.kind));
  // Taking money needs the site's right to sell every plan it opens, before any account is made (a refund or cancel never
  // does: money already taken must still be returnable after a licence ends). A bare pack is asked once with no plan.
  if (isPayment) {
    for (const plan of plans.length ? plans : [undefined]) {
      const refusal = await deps.maySell(db, site, plan);
      if (refusal) throw new PaymentParseError(refusal);
    }
  }
  let organizationId: string;
  try {
    ({ organizationId } = await deps.ensureCustomer(db, { site, wpUserId: wpUserId as number, email, displayName: displayName as string | null | undefined, emailVerified: emailVerified === true },
      planKey, isPayment));
  } catch (error) {
    if (error instanceof WpCustomerRefused) {
      if (site.sellerKind === "internal" || SITE_LOCAL_REFUSALS.has(error.code)) throw new PaymentParseError(error.code);
      throw new PaymentParseError("customer_refused", error.code);
    }
    throw error;
  }
  return { eventId, event: toPaymentEvent({ ...rest, organization_id: organizationId }), siteId: site.id };
}
