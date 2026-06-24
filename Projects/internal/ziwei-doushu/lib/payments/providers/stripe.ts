import type { PaymentGateway } from '../types';
import { PaymentNotImplementedError } from '../errors';

/**
 * Stripe — 國際主力,且為全球本地支付聚合器(卡/Apple·Google Pay/SEPA/iDEAL/
 * Klarna/Boleto/Alipay…,各區後台開關)。服務台灣與國際。
 * F3 為接縫 stub:介面與地區已固定;實際 Checkout/Tax/webhook 待金流階段。
 */
export const stripeGateway: PaymentGateway = {
  id: 'stripe',
  regions: ['TW', 'INTL'],
  isConfigured: () => Boolean(process.env.STRIPE_SECRET_KEY),
  async createCheckout() {
    throw new PaymentNotImplementedError('stripe');
  },
};
