// `local` payments (ADR 017 step 4a): the operator records a bank transfer, and the tests and the off-WordPress run
// (§0b rule 6) use the same path. Body = {"event_id": "...", ...PaymentEvent}; header X-AwareWave-Payment-Signature =
// base64(HMAC-SHA256(raw body, PAYMENTS_LOCAL_SECRET)), the same construction Woo uses for X-WC-Webhook-Signature.
// The secret is shared only by the operator's recording command and the app; under 32 characters nothing verifies.
import { createHmac } from "node:crypto";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { PaymentParseError, toPaymentEvent, type PaymentProvider } from "./provider";

export const LOCAL_SIGNATURE_HEADER = "x-awarewave-payment-signature";
const MIN_SECRET = 32;

export const signLocalPayment = (rawBody: string, secret: string): string =>
  createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");

export function localProvider(env: Record<string, string | undefined>): PaymentProvider {
  const secret = (env.PAYMENTS_LOCAL_SECRET ?? "").trim();
  return {
    name: "local",
    verify(headers, rawBody) {
      const given = headers.get(LOCAL_SIGNATURE_HEADER);
      if (secret.length < MIN_SECRET || !given) return false;
      return timingSafeEqual(given, signLocalPayment(rawBody, secret));
    },
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
