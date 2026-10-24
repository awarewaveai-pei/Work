import { localProvider } from "./local";
import { wooBillingProvider } from "./woo-billing";
import type { PaymentProvider, PaymentProviderName } from "./provider";

export type { PaymentEvent, PaymentProvider, PaymentProviderName, ReceivedPayment } from "./provider";
export { PaymentParseError } from "./provider";

// woo = lib/payments/woo-billing.ts (the wp-bridge plugin's events); lib/payments/woo.ts is the bridge write client.
const PROVIDERS: Partial<Record<PaymentProviderName, (env: Record<string, string | undefined>) => PaymentProvider>> = {
  local: localProvider,
  woo: wooBillingProvider,
};

/** A provider answers only when PAYMENTS_PROVIDERS (comma list, e.g. "local" or "local,woo") names it; unset = none.
 *  A list, not the card's single PAYMENTS_PROVIDER: bank transfers (local) keep coming in after Woo is switched on. */
export function paymentProvider(name: string, env: Record<string, string | undefined> = process.env): PaymentProvider | null {
  const enabled = new Set((env.PAYMENTS_PROVIDERS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (!enabled.has(name)) return null;
  const make = PROVIDERS[name as PaymentProviderName];
  return make ? make(env) : null;
}
