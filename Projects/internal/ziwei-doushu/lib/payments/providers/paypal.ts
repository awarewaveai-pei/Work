import type { PaymentGateway } from '../types';
import { PaymentNotImplementedError } from '../errors';

/**
 * PayPal — 國際自有網絡(部分地區/年齡層只認 PayPal,缺了會漏單)。
 * F3 為接縫 stub:介面與地區已固定;實際 Orders API/webhook 待金流階段。
 */
export const paypalGateway: PaymentGateway = {
  id: 'paypal',
  regions: ['INTL'],
  isConfigured: () =>
    Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
  async createCheckout() {
    throw new PaymentNotImplementedError('paypal');
  },
};
