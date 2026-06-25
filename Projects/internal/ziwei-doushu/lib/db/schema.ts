import type { Locale } from '@/lib/i18n/config';
import type { SystemId } from '@/lib/divination/types';
import type { AiProviderId } from '@/lib/ai/types';
import type {
  OrderKind,
  PaymentProviderId,
} from '@/lib/payments/types';

/**
 * 資料模型型別 (PLAN §15)。先以 TS 型別固定 schema 合約(零依賴),
 * 實際 Supabase 接線(@supabase/supabase-js + migration + RLS)於 DB 階段。
 * 所有使用者私有資料表受 RLS:使用者只能讀自己的列。
 */
export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface Chart {
  id: string;
  userId: string;
  system: SystemId;
  birthInput: unknown; // jsonb(各系統特定輸入)
  result: unknown; // jsonb(排盤結果快照)
  locale: Locale;
  createdAt: string;
}

export interface Subscription {
  userId: string;
  plan: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  periodStart: string;
  periodEnd: string;
  provider: PaymentProviderId;
  providerRef: string;
  currency: string;
}

export interface CreditLedger {
  id: string;
  userId: string;
  delta: number;
  reason: string;
  createdAt: string;
}

export interface Reading {
  id: string;
  chartId: string;
  system: SystemId;
  provider: AiProviderId;
  model: string;
  locale: Locale;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  createdAt: string;
}

/** 每日運勢快取(PLAN §9):key = chart_id|date|locale 或 sign|date|locale。 */
export interface DailyFortuneCache {
  key: string;
  payload: unknown; // jsonb
  createdAt: string;
}

export interface Order {
  id: string;
  userId: string;
  kind: OrderKind;
  items: unknown; // jsonb
  amount: number;
  currency: string;
  provider: PaymentProviderId;
  providerRef: string;
  /** 實體商品對應 Woo 訂單 id(headless,PLAN §11) */
  wooOrderId?: string;
  tax: unknown; // jsonb(Stripe Tax 明細)
  status: 'pending' | 'paid' | 'fulfilled' | 'refunded' | 'failed';
  createdAt: string;
}

/** 三品牌漏斗歸因(PLAN §12)。 */
export interface AttributionEvent {
  visitorId: string;
  channel: string;
  utm: unknown; // jsonb
  targetBrand: 'self' | 'soulful' | 'wtw';
  landedAt: string;
  convertedAt?: string;
}

/** GDPR 同意紀錄(PLAN §17)。 */
export interface Consent {
  userId: string;
  type: string;
  grantedAt?: string;
  revokedAt?: string;
  ip: string;
  locale: Locale;
}
