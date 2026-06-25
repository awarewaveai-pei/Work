import type { PaymentGateway } from '../types';
import { PaymentNotImplementedError } from '../errors';

/**
 * 綠界 ECPay — 台灣/中文圈本地收款(信用卡/超商/ATM)。
 * F3 為接縫 stub:介面與地區已固定;實際建單/驗簽待金流階段接 SDK。
 */
export const ecpayGateway: PaymentGateway = {
  id: 'ecpay',
  regions: ['TW'],
  isConfigured: () =>
    Boolean(process.env.ECPAY_MERCHANT_ID && process.env.ECPAY_HASH_KEY),
  async createCheckout() {
    throw new PaymentNotImplementedError('ecpay');
  },
};
