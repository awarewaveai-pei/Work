import { createHmac, timingSafeEqual } from "node:crypto";

/** Provider boundary for subscription checkout; card data never enters this app. */
export interface CheckoutRequest {
  readonly organizationId: string;
  readonly priceId: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly customerEmail?: string;
}
export interface CheckoutSession { readonly provider: "stripe"; readonly id: string; readonly url: string; }
export interface PaymentProvider { readonly id: "stripe"; createCheckoutSession(input: CheckoutRequest): Promise<CheckoutSession>; }

function httpsUrl(value: string, field: string, allowedOrigin: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${field} must be an absolute HTTPS URL`); }
  if (url.protocol !== "https:") throw new Error(`${field} must be an absolute HTTPS URL`);
  if (url.origin !== allowedOrigin) throw new Error(`${field} origin is not allowed`);
  return url.toString();
}

/** Stripe adapter is constructed only when both provider selection and key exist. */
export function getPaymentProvider(): PaymentProvider | null {
  if ((process.env.MEDIA_PAYMENT_PROVIDER ?? "").trim().toLowerCase() !== "stripe") return null;
  const secret = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(secret)) return null;
  return {
    id: "stripe",
    async createCheckoutSession(input: CheckoutRequest): Promise<CheckoutSession> {
      if (!/^price_[A-Za-z0-9]+$/.test(input.priceId)) throw new Error("priceId must be a Stripe price id");
      const allowedOrigin = (process.env.MEDIA_CHECKOUT_ALLOWED_ORIGIN ?? "").trim().replace(/\/$/, "");
      if (!/^https:\/\//i.test(allowedOrigin)) throw new Error("MEDIA_CHECKOUT_ALLOWED_ORIGIN is not configured");
      const params = new URLSearchParams();
      params.set("mode", "subscription");
      params.set("line_items[0][price]", input.priceId);
      params.set("line_items[0][quantity]", "1");
      params.set("success_url", httpsUrl(input.successUrl, "successUrl", allowedOrigin));
      params.set("cancel_url", httpsUrl(input.cancelUrl, "cancelUrl", allowedOrigin));
      params.set("client_reference_id", input.organizationId);
      params.set("metadata[organization_id]", input.organizationId);
      if (input.customerEmail) params.set("customer_email", input.customerEmail);
      const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
        signal: AbortSignal.timeout(15_000),
      });
      const body = await response.json().catch(() => ({})) as { id?: string; url?: string; error?: { message?: string } };
      if (!response.ok || !body.id || !body.url) throw new Error(body.error?.message ?? `Stripe checkout failed (HTTP ${response.status})`);
      return { provider: "stripe", id: body.id, url: body.url };
    },
  };
}

/** Verify Stripe-Signature without importing a payment SDK. */
export function verifyStripeWebhook(rawBody: string, signature: string, secret: string, toleranceSeconds = 300): boolean {
  const parts = signature.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const provided = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  const ts = Number(timestamp);
  if (!Number.isSafeInteger(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSeconds || provided.length === 0) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return provided.some((value) => {
    if (!/^[0-9a-f]{64}$/i.test(value)) return false;
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(value, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  });
}
