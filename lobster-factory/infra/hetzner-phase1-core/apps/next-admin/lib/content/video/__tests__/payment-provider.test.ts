import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getPaymentProvider, verifyStripeWebhook } from "../payment-provider";

describe("payment provider boundary", () => {
  it("fails closed unless provider and key are explicitly configured", () => {
    const previous = { provider: process.env.MEDIA_PAYMENT_PROVIDER, key: process.env.STRIPE_SECRET_KEY };
    delete process.env.MEDIA_PAYMENT_PROVIDER;
    delete process.env.STRIPE_SECRET_KEY;
    expect(getPaymentProvider()).toBeNull();
    if (previous.provider === undefined) delete process.env.MEDIA_PAYMENT_PROVIDER; else process.env.MEDIA_PAYMENT_PROVIDER = previous.provider;
    if (previous.key === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = previous.key;
  });

  it("verifies timestamped Stripe webhook signatures", () => {
    const body = JSON.stringify({ id: "evt_test" });
    const secret = "whsec_test";
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    expect(verifyStripeWebhook(body, `t=${timestamp},v1=${digest}`, secret)).toBe(true);
    expect(verifyStripeWebhook(body, `t=${timestamp},v1=${"0".repeat(64)}`, secret)).toBe(false);
  });
});

