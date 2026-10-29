// `local` payments (ADR 017 step 4a): the operator records a bank transfer, and the tests and the off-WordPress run
// (§0b rule 6) use the same path. Body = {"event_id": "...", ...PaymentEvent}; header X-AwareWave-Payment-Signature =
// base64(HMAC-SHA256(raw body, PAYMENTS_LOCAL_SECRET)), the same construction Woo uses for X-WC-Webhook-Signature.
// The secret is shared only by the operator's recording command and the app; under 32 characters nothing verifies.
import { PAYMENT_SIGNATURE_HEADER, signPayment, verifyPayment } from "./hmac";
import { PaymentParseError, toPaymentEvent, type PaymentProvider } from "./provider";

export const LOCAL_SIGNATURE_HEADER = PAYMENT_SIGNATURE_HEADER;
export const signLocalPayment = signPayment;

export function localProvider(env: Record<string, string | undefined>): PaymentProvider {
  return {
    name: "local",
    // No site: an operator-recorded transfer (0133 local_has_no_site).
    verify: (headers, rawBody) => (verifyPayment(rawBody, headers.get(LOCAL_SIGNATURE_HEADER), env.PAYMENTS_LOCAL_SECRET) ? {} : null),
    parse(rawBody) {
      let body: unknown;
      try { body = JSON.parse(rawBody); } catch { throw new PaymentParseError("invalid_json"); }
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new PaymentParseError("not_an_object");
      const { event_id: eventId, ...rest } = body as Record<string, unknown>;
      if (typeof eventId !== "string" || !/^[\w.:\-/#]{1,200}$/.test(eventId)) throw new PaymentParseError("invalid_event_id");
      return { eventId, event: toPaymentEvent(rest) };
    },
  };
}
