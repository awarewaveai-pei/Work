import type { Locale } from '@/lib/i18n/config';
import type { InterpretationContext } from '@/lib/divination/types';

/**
 * AI 解讀層型別 (F3 接縫)。廠商無關:同一 interpret() 介面下接多家 provider。
 */
export type AiProviderId = 'openai' | 'anthropic';

/** 模型分級:輕量(每日運勢)/ 深度(主力報告)/ 頂規(全年流年·合婚)。 */
export type AiTier = 'light' | 'deep' | 'premium';

export interface InterpretRequest {
  /** 系統無關的結構化命盤事實(見 lib/divination/types) */
  context: InterpretationContext;
  tier: AiTier;
  locale: Locale;
}

export interface Reading {
  text: string;
  provider: AiProviderId;
  model: string;
}

export interface AiProviderAdapter {
  readonly id: AiProviderId;
  /** 是否已具備 API key(env)。未設定時 interpret() 不應被呼叫。 */
  isConfigured(): boolean;
  interpret(req: InterpretRequest): Promise<Reading>;
}
