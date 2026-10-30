// Daily reconciliation of aware-wave.com (ADR 017 4b): every paid WooCommerce order the aware-wave-store plugin should
// have turned into a payment event, against payment_events. The plugin owns which orders count (AwareWave lines, a
// member, a method on its automatic list or the sign-up gift) and answers GET /wp-json/aware-wave-store/v1/reconcile
// (includes/Reconcile.php); this file only compares. Matching uses what both sides already write: a credit pack is
// event `wc:payment_complete:<order>:credit_pack`; a subscription payment is a subscription_paid event whose
// external_ref is the subscription and whose paid_at is the order's date_paid (PaymentEvents.php paidAt).
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AWARE_WAVE_KEY_ID, findSiteByKeyId } from "./sites";
import { paymentProvider } from "./index";
import { ORDER_EVENT_KINDS, siteOrderEvents } from "@/lib/entitlements/payment-events";

export interface WooOrderFact {
  id: number;
  /** unix seconds; 0 = WooCommerce recorded none */
  datePaid: number;
  paymentMethod: string;
  /** the order has paid credit-pack lines */
  credit: boolean;
  /** subscriptions this order started or renewed, with the AwareWave plans each carries (one event per plan) */
  subscriptions: Array<{ id: number; plans: string[] }>;
  /** false = the plugin does not send this order by itself (method not on the list, guest): someone records it */
  auto: boolean;
  /** fully refunded since: its refund event is expected too (only if the plugin had granted it) */
  refunded: boolean;
  granted: boolean;
  reason?: string;
}
export interface WooEventFact { eventId: string; kind: string; externalRef: string | null; planKey: string | null; paidAt: string | null; receivedAt: string }
export interface Reconciliation {
  from: number;
  to: number;
  matched: number;
  /** a payment the plugin should have sent and payment_events does not have */
  missing: Array<{ orderId: number; expected: string }>;
  /** a payment event in the window that no paid order accounts for (refunded, deleted, sent twice under another id) */
  extra: WooEventFact[];
  /** paid AwareWave orders the plugin leaves to a person */
  manual: WooOrderFact[];
}

const iso = (unix: number) => new Date(unix * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
const ORDER_KINDS = new Set<string>(ORDER_EVENT_KINDS);

/** Pure comparison over one window [from, to) in unix seconds. */
export function reconcileWoo(orders: WooOrderFact[], events: WooEventFact[], from: number, to: number): Reconciliation {
  const used = new Set<WooEventFact>();
  const take = (pick: (e: WooEventFact) => boolean) => {
    const hit = events.find((e) => !used.has(e) && pick(e));
    if (hit) used.add(hit);
    return hit;
  };
  const missing: Reconciliation["missing"] = [];
  let matched = 0;
  for (const o of orders.filter((x) => x.auto)) {
    if (o.credit) {
      const id = `wc:payment_complete:${o.id}:credit_pack`;
      if (take((e) => e.eventId === id)) matched++;
      else missing.push({ orderId: o.id, expected: id });
    }
    const paid = o.datePaid > 0 ? iso(o.datePaid) : null;
    for (const sub of o.subscriptions) {
      for (const plan of sub.plans) {
        // An event that names no paid_at (a renewal sent without its order) matches on the subscription and plan alone.
        if (take((e) => e.kind === "subscription_paid" && e.externalRef === String(sub.id) && e.planKey === plan && (paid === null || e.paidAt === null || e.paidAt === paid))) matched++;
        else missing.push({ orderId: o.id, expected: `subscription ${sub.id} ${plan}${paid ? ` paid_at ${paid}` : ""}` });
      }
    }
    if (o.refunded && o.granted) {
      const prefix = `wc:order_status_refunded:${o.id}:`;
      if (take((e) => e.kind === "refund" && e.eventId.startsWith(prefix))) matched++;
      else missing.push({ orderId: o.id, expected: `${prefix}* (full refund)` });
    }
  }
  // A plan switch has no order of its own (PaymentEvents.php onSwitchedItem), so it is never "extra".
  const inWindow = (e: WooEventFact) => {
    const t = Date.parse(e.paidAt ?? e.receivedAt) / 1000;
    return t >= from && t < to;
  };
  const extra = events.filter((e) => !used.has(e) && ORDER_KINDS.has(e.kind) && !e.eventId.startsWith("wc:subscriptions_switched_item:") && inWindow(e));
  return { from, to, matched, missing, extra, manual: orders.filter((o) => !o.auto) };
}

/** The signed request the plugin verifies with the same secret as aware-wave.com's payment events (PAYMENTS_WOO_SECRET).
 *  The label keeps a reconcile signature from ever passing as a payment-event signature, and the reverse. */
export function reconcileSignature(secret: string, from: number, to: number, ts: number): string {
  return createHmac("sha256", secret).update(`awarewave-reconcile-v1\n${from}\n${to}\n${ts}`).digest("base64");
}

type Env = Record<string, string | undefined>;

/** The plugin's answer for [from, to), signed with the secret aware-wave.com's seller_sites row names (hmac-env).
 *  Throws with a short code on any failure; never returns a partial list. */
export async function fetchWooOrders(from: number, to: number, env: Env = process.env, fetchImpl: typeof fetch = fetch, secretVar = "PAYMENTS_WOO_SECRET"): Promise<WooOrderFact[]> {
  const secret = env[secretVar];
  if (!secret) throw new Error("reconcile_secret_unset");
  const base = (env.WOO_RECONCILE_BASE_URL ?? "https://aware-wave.com").replace(/\/+$/, "");
  const ts = Math.floor(Date.now() / 1000);
  const url = `${base}/wp-json/aware-wave-store/v1/reconcile?from=${from}&to=${to}`;
  const res = await fetchImpl(url, {
    headers: { "X-AwareWave-Reconcile-Timestamp": String(ts), "X-AwareWave-Reconcile-Signature": reconcileSignature(secret, from, to, ts) },
    signal: AbortSignal.timeout(20_000), cache: "no-store",
  });
  if (!res.ok) throw new Error(`reconcile_http_${res.status}`);
  const body = (await res.json()) as { ok?: boolean; orders?: unknown };
  if (body.ok !== true || !Array.isArray(body.orders)) throw new Error("reconcile_bad_body");
  return body.orders.map((raw) => {
    const o = raw as Record<string, unknown>;
    const id = Number(o.id);
    if (!Number.isInteger(id) || id < 1) throw new Error("reconcile_bad_order");
    return {
      id, datePaid: Number(o.date_paid) || 0, paymentMethod: String(o.payment_method ?? ""), credit: o.credit === true,
      subscriptions: Array.isArray(o.subscriptions) ? o.subscriptions.map((x) => x as { id?: unknown; plans?: unknown })
        .filter((x) => Number.isInteger(Number(x.id)) && Number(x.id) > 0)
        .map((x) => ({ id: Number(x.id), plans: Array.isArray(x.plans) ? x.plans.filter((k): k is string => typeof k === "string") : [] })) : [],
      auto: o.auto === true, refunded: o.refunded === true, granted: o.granted === true, ...(typeof o.reason === "string" ? { reason: o.reason } : {}),
    };
  });
}

/** aware-wave.com's order-kind events received since a day before the window (a payment is sent after it is paid). */
export async function loadWooEvents(db: SupabaseClient, siteId: string, from: number): Promise<WooEventFact[]> {
  return (await siteOrderEvents(db, siteId, iso(from - 86_400))).map((r) => ({
    eventId: r.event_id, kind: r.kind, receivedAt: r.received_at,
    externalRef: typeof r.payload.external_ref === "string" ? r.payload.external_ref : null,
    planKey: typeof r.payload.plan_key === "string" ? r.payload.plan_key : null,
    paidAt: typeof r.payload.paid_at === "string" ? r.payload.paid_at : null,
  }));
}

/** The last RECONCILE_DAYS days up to RECONCILE_LAG_SEC ago (the plugin sends through a queue, so a payment made a
 *  minute ago may not have arrived yet). */
export const RECONCILE_DAYS = 7;
export const RECONCILE_LAG_SEC = 15 * 60;
export function reconcileWindow(now = Math.floor(Date.now() / 1000)): { from: number; to: number } {
  const to = now - RECONCILE_LAG_SEC;
  return { from: to - RECONCILE_DAYS * 86_400, to };
}

/** Woo payments are on only when PAYMENTS_PROVIDERS names woo (lib/payments/index.ts, the one switch); until then there
 *  is nothing to reconcile and no secret to sign with. */
export async function runWooReconciliation(db: SupabaseClient, now?: number, env: Env = process.env, fetchImpl: typeof fetch = fetch): Promise<Reconciliation | { enabled: false }> {
  if (!paymentProvider("woo", env)) return { enabled: false };
  const { from, to } = reconcileWindow(now);
  const site = await findSiteByKeyId(db, AWARE_WAVE_KEY_ID);
  if (!site) throw new Error("reconcile_site_missing");
  if (site.verifyAlg !== "hmac-env" || !site.envVar) throw new Error("reconcile_site_not_hmac");   // ed25519 sites: no shared secret to sign with
  const [orders, events] = await Promise.all([fetchWooOrders(from, to, env, fetchImpl, site.envVar), loadWooEvents(db, site.id, from)]);
  return reconcileWoo(orders, events, from, to);
}

// /ops/billing shows the last answer up to RECONCILE_CACHE_MS old instead of asking WordPress on every render; the daily
// route always asks afresh. Per process.
const RECONCILE_CACHE_MS = 10 * 60_000;
let cached: { at: number; value: Reconciliation | { enabled: false } } | null = null;
export async function recentWooReconciliation(db: SupabaseClient): Promise<{ value: Reconciliation | { enabled: false }; at: number }> {
  if (cached && Date.now() - cached.at < RECONCILE_CACHE_MS) return cached;
  cached = { at: Date.now(), value: await runWooReconciliation(db) };
  return cached;
}
