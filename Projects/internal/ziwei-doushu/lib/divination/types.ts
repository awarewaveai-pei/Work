import type { Locale } from '@/lib/i18n/config';

/**
 * 命理系統統一合約 (F3 接縫)。
 *
 * 設計目標(30 年可擴可刪):新增一個系統 = 實作 DivinationSystem 並 register;
 *   移除 = 刪模組 + 不再 register。其餘程式(AI 解讀、付費牆、UI 路由)透過
 *   InterpretationContext 這個「系統無關」結構運作,不需認識各系統內部。
 */

export type SystemId = 'ziwei' | 'bazi' | 'iching' | 'tarot' | 'astrology';

/**
 * 給 AI 解讀層的「系統無關」結構化輸入。
 * 任何系統(命盤/八字/卦象/牌陣)都先轉成這個型別,interpret() 只認得它
 * → 解讀層與各命理系統解耦,且 AI 能據 facts 產生「綁具體元素」的解讀
 *   (非空泛巴納姆)。
 */
export interface InterpretationContext {
  systemId: SystemId;
  locale: Locale;
  /** 一句話標題,例:「破軍 · 木三局」 */
  headline: string;
  /** 結構化事實清單(label 為穩定識別、value 已依 locale 在地化) */
  facts: ReadonlyArray<{ label: string; value: string }>;
}

export interface SystemMeta {
  id: SystemId;
  /** 排盤系(需出生資料)vs 抽選系(需亂數/提問) */
  kind: 'chart' | 'draw';
  /** 是否需外部 API key 才能運作(目前僅西洋占星) */
  requiresApiKey: boolean;
}

/**
 * 命理系統合約。
 * @typeParam TInput 系統特定輸入(命盤=生辰、抽選=提問/亂數種子)
 * @typeParam TData  系統特定可渲染資料(供前端元件繪製)
 */
export interface DivinationSystem<TInput = unknown, TData = unknown> {
  readonly meta: SystemMeta;
  /** 排盤/起卦/抽牌 → 可渲染資料 + 給 AI 的系統無關 context */
  compute(
    input: TInput,
    locale: Locale,
  ): Promise<{ data: TData; context: InterpretationContext }>;
}
