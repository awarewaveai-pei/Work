// Payment connector (ADR 017 §0b rule 5, step 4). A provider proves a request is its own (verify) and turns the body
// into one PaymentEvent (parse); the control plane (lib/entitlements/contracts.ts) knows only PaymentEvent, never a
// vendor field. 4a ships `local` (the operator records a bank transfer); `woo` is 4b. Field names are the wire names
// billing_apply_payment_event (migration 0120) reads, so the event is passed through without a second mapping.
// Which providers answer is configuration: lib/payments/index.ts.

import type { SellerSite } from "./sites";

export type PaymentProviderName = "local" | "woo";

export type PaymentEvent =
  // paid_at (optional, both money-in kinds): when the shop recorded the payment; the monthly seller report goes by it
  // within 7 days of receipt (migration 0142), else by when the event arrived.
  | { kind: "subscription_paid"; organization_id: string; plan_key: string; period_end: string; external_ref?: string; paid_at?: string }
  | { kind: "subscription_canceled"; organization_id: string; plan_key: string }
  // plan_key (optional): the pack's add-on plan; 0128 writes its rows with no end date (ADR 017 decision 6).
  | { kind: "credit_pack"; organization_id: string; units: number; order_ref: string; plan_key?: string; paid_at?: string }
  | { kind: "refund"; target: "subscription"; organization_id: string; plan_key: string }
  | { kind: "refund"; target: "credit_pack"; organization_id: string; order_ref: string }
  | { kind: "chargeback"; organization_id: string; ref?: string }
  | { kind: "chargeback_cleared"; organization_id: string; note?: string };

/** event_id is the provider's own id for this notification: the inbox key (per site), so a resend is a no-op.
 *  siteId = the seller_sites row that signed it (woo); null/absent = `local`, which has no site (0133). */
export interface ReceivedPayment { eventId: string; event: PaymentEvent; siteId?: string | null }

/** What verify() proved about the sender. `site` = the seller_sites row whose own key signed the request (woo); parse
 *  and refused receive this same object, so the site that bills is always the site that signed (4c-2). */
export interface VerifiedSender { site?: SellerSite }

export interface PaymentProvider {
  name: PaymentProviderName;
  /** Non-null only for a request this provider sent: a signature over the exact raw body. Async when the key is looked
   *  up (woo: the site's row); a lookup outage rejects, and the route answers "not recorded" so the sender retries. */
  verify(headers: Headers, rawBody: string): VerifiedSender | null | Promise<VerifiedSender | null>;
  /** Throws (or rejects with) PaymentParseError for anything that is not one well-formed event. A provider whose events
   *  name the payer by an outside id (woo: the WordPress member) resolves the billing account here, so it is async. */
  parse(rawBody: string, sender: VerifiedSender): ReceivedPayment | Promise<ReceivedPayment>;
  /** Called by the route for every final refusal of a request that passed verify(): a parse refusal or a control-plane
   *  rejection. A provider whose sender cannot be told (woo: the shop already took the money) alerts the operator here.
   *  Must not throw. */
  refused?(rawBody: string, code: string, sender: VerifiedSender): Promise<void>;
}

/** code = what the sender is told; detail = what the operator's incident says, when the sender must not learn it (a
 *  seller's site must not learn whether an email is staff's or another seller's customer, critic 2026-10-29 M1). */
export class PaymentParseError extends Error {
  constructor(readonly code: string, readonly detail?: string) { super(`payment_parse:${code}`); this.name = "PaymentParseError"; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF = /^[\w.:\-/#]{1,100}$/;
const KEY = /^[a-z0-9][a-z0-9_.-]{0,99}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
/** An ISO instant whose date exists: Date.parse rolls 2026-02-31 over to March 3, so the day is checked itself
 *  (Codex 2026-10-29 partialreview-dce49ed8; the SQL side casts and would refuse or skip it). */
function instant(o: Record<string, unknown>, k: string): string {
  const v = text(o, k, ISO_TIME);
  const [y, m, d] = v.slice(0, 10).split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d || !Number.isFinite(Date.parse(v))) {
    throw new PaymentParseError(`invalid_${k}`);
  }
  return v;
}
const optionalTime = (o: Record<string, unknown>, k: string): Record<string, string> =>
  (o[k] === undefined || o[k] === null ? {} : { [k]: instant(o, k) });

const text = (o: Record<string, unknown>, k: string, re: RegExp): string => {
  const v = o[k];
  if (typeof v !== "string" || !re.test(v)) throw new PaymentParseError(`invalid_${k}`);
  return v;
};
const optional = (o: Record<string, unknown>, k: string, re: RegExp): Record<string, string> =>
  o[k] === undefined || o[k] === null ? {} : { [k]: text(o, k, re) };

/** The shape every provider's parse() must end in; the SQL function re-checks every business rule. */
export function toPaymentEvent(value: unknown): PaymentEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PaymentParseError("not_an_object");
  const o = value as Record<string, unknown>;
  const organization_id = text(o, "organization_id", UUID);
  switch (o.kind) {
    case "subscription_paid": {
      const period_end = instant(o, "period_end");
      return { kind: o.kind, organization_id, plan_key: text(o, "plan_key", KEY), period_end, ...optional(o, "external_ref", REF), ...optionalTime(o, "paid_at") };
    }
    case "subscription_canceled":
      return { kind: o.kind, organization_id, plan_key: text(o, "plan_key", KEY) };
    case "credit_pack": {
      if (!Number.isSafeInteger(o.units) || (o.units as number) < 1 || (o.units as number) > 10_000_000) throw new PaymentParseError("invalid_units");
      return { kind: o.kind, organization_id, units: o.units as number, order_ref: text(o, "order_ref", REF), ...optional(o, "plan_key", KEY), ...optionalTime(o, "paid_at") };
    }
    case "refund":
      if (o.target === "subscription") return { kind: "refund", target: "subscription", organization_id, plan_key: text(o, "plan_key", KEY) };
      if (o.target === "credit_pack") return { kind: "refund", target: "credit_pack", organization_id, order_ref: text(o, "order_ref", REF) };
      throw new PaymentParseError("invalid_target");
    case "chargeback":
      return { kind: o.kind, organization_id, ...optional(o, "ref", REF) };
    case "chargeback_cleared": {
      if (o.note === undefined) return { kind: o.kind, organization_id };
      if (typeof o.note !== "string" || o.note.length > 500) throw new PaymentParseError("invalid_note");
      return { kind: o.kind, organization_id, note: o.note };
    }
    default:
      throw new PaymentParseError("unknown_kind");
  }
}
