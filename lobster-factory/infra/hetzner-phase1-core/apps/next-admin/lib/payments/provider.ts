// Payment connector (ADR 017 §0b rule 5, step 4). A provider proves a request is its own (verify) and turns the body
// into one PaymentEvent (parse); the control plane (lib/entitlements/contracts.ts) knows only PaymentEvent, never a
// vendor field. 4a ships `local` (the operator records a bank transfer); `woo` is 4b. Field names are the wire names
// billing_apply_payment_event (migration 0120) reads, so the event is passed through without a second mapping.
// Which providers answer is configuration: lib/payments/index.ts.

export type PaymentProviderName = "local" | "woo";

export type PaymentEvent =
  | { kind: "subscription_paid"; organization_id: string; plan_key: string; period_end: string; external_ref?: string }
  | { kind: "subscription_canceled"; organization_id: string; plan_key: string }
  | { kind: "credit_pack"; organization_id: string; units: number; order_ref: string }
  | { kind: "refund"; target: "subscription"; organization_id: string; plan_key: string }
  | { kind: "refund"; target: "credit_pack"; organization_id: string; order_ref: string }
  | { kind: "chargeback"; organization_id: string; ref?: string }
  | { kind: "chargeback_cleared"; organization_id: string; note?: string };

/** event_id is the provider's own id for this notification: the inbox key, so a resend is a no-op. */
export interface ReceivedPayment { eventId: string; event: PaymentEvent }

export interface PaymentProvider {
  name: PaymentProviderName;
  /** true only for a request this provider sent: a signature over the exact raw body. */
  verify(headers: Headers, rawBody: string): boolean;
  /** Throws PaymentParseError for anything that is not one well-formed event. */
  parse(rawBody: string): ReceivedPayment;
}

export class PaymentParseError extends Error {
  constructor(readonly code: string) { super(`payment_parse:${code}`); this.name = "PaymentParseError"; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF = /^[\w.:\-/#]{1,100}$/;
const KEY = /^[a-z0-9][a-z0-9_.-]{0,99}$/;

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
      const period_end = text(o, "period_end", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/);
      if (!Number.isFinite(Date.parse(period_end))) throw new PaymentParseError("invalid_period_end");
      return { kind: o.kind, organization_id, plan_key: text(o, "plan_key", KEY), period_end, ...optional(o, "external_ref", REF) };
    }
    case "subscription_canceled":
      return { kind: o.kind, organization_id, plan_key: text(o, "plan_key", KEY) };
    case "credit_pack": {
      if (!Number.isSafeInteger(o.units) || (o.units as number) < 1 || (o.units as number) > 10_000_000) throw new PaymentParseError("invalid_units");
      return { kind: o.kind, organization_id, units: o.units as number, order_ref: text(o, "order_ref", REF) };
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
