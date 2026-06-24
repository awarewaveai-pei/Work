import type { PaymentGateway, PaymentProviderId, Region } from './types';
import { ecpayGateway } from './providers/ecpay';
import { stripeGateway } from './providers/stripe';
import { paypalGateway } from './providers/paypal';
import { NoGatewayForRegionError } from './errors';

/**
 * 金流 gateway 登錄 + 地區路由 (F3,PLAN §13.2)。
 */
const GATEWAYS: Record<PaymentProviderId, PaymentGateway> = {
  ecpay: ecpayGateway,
  stripe: stripeGateway,
  paypal: paypalGateway,
};

export function getGateway(id: PaymentProviderId): PaymentGateway {
  return GATEWAYS[id];
}

export function listGateways(): PaymentGateway[] {
  return Object.values(GATEWAYS);
}

/** 列出某地區可用(已設定金鑰)的 gateway。 */
export function availableGateways(region: Region): PaymentGateway[] {
  return listGateways().filter(
    (g) => g.regions.includes(region) && g.isConfigured(),
  );
}

/**
 * 依地區挑選 gateway。
 * 優先序:① 指定的 preferred(若服務該地區)② 該地區已設定金鑰者
 *        ③ 該地區任一(供尚未設定金鑰時的 UI 佔位)。
 * 全無 → NoGatewayForRegionError。
 */
export function selectGateway(
  region: Region,
  preferred?: PaymentProviderId,
): PaymentGateway {
  if (preferred) {
    const g = GATEWAYS[preferred];
    if (g.regions.includes(region)) return g;
  }
  const configured = availableGateways(region);
  if (configured.length > 0) return configured[0];

  const anyForRegion = listGateways().find((g) => g.regions.includes(region));
  if (anyForRegion) return anyForRegion;

  throw new NoGatewayForRegionError(region);
}
