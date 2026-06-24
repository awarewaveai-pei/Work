import type { Locale } from '@/lib/i18n/config';

/**
 * 金流抽象層型別 (F3 接縫,PLAN §13.2)。
 * 同一介面下接多家 provider;加一家 = 加一個 adapter,前台/結帳/商品零改動。
 */
export type PaymentProviderId = 'ecpay' | 'stripe' | 'paypal';

/** 收款地區:台灣/中文圈 vs 國際。決定預設 gateway 路由。 */
export type Region = 'TW' | 'INTL';

/** 三種收款共用同一金流層(PLAN §11):訂閱 / 數位商品 / 實體商品。 */
export type OrderKind = 'subscription' | 'digital' | 'physical';

export interface PaymentOrder {
  id: string;
  /** 主要貨幣單位金額(例 249 = NT$249、9.99 = US$9.99) */
  amount: number;
  /** ISO 4217,例 'TWD' / 'USD' / 'EUR' */
  currency: string;
  description: string;
  kind: OrderKind;
}

export interface CheckoutSession {
  provider: PaymentProviderId;
  /** 有縫:導向付款頁 URL(MVP) */
  redirectUrl?: string;
  /** 無縫:前端付款所需 client secret / token(進階) */
  clientSecret?: string;
}

export interface PaymentGateway {
  readonly id: PaymentProviderId;
  /** 此 gateway 服務的地區 */
  readonly regions: ReadonlyArray<Region>;
  /** 是否已設定金鑰(env) */
  isConfigured(): boolean;
  createCheckout(order: PaymentOrder, locale: Locale): Promise<CheckoutSession>;
}
