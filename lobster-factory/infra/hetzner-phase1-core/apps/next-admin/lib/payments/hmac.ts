// One signature construction for every payment sender we own (the operator's record-payment.mjs as `local`, the
// wp-bridge plugin as `woo`): header value = base64(HMAC-SHA256(raw body, secret)), the construction Woo itself uses
// for X-WC-Webhook-Signature. A secret under 32 characters verifies nothing.
import { createHmac } from "node:crypto";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";

export const PAYMENT_SIGNATURE_HEADER = "x-awarewave-payment-signature";
export const MIN_PAYMENT_SECRET = 32;

export const signPayment = (rawBody: string, secret: string): string =>
  createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");

export function verifyPayment(rawBody: string, given: string | null, secret: string | undefined): boolean {
  const key = (secret ?? "").trim();
  if (key.length < MIN_PAYMENT_SECRET || !given) return false;
  return timingSafeEqual(given, signPayment(rawBody, key));
}
