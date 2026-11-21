import type { Locale } from '@/lib/i18n/config';

/**
 * 命理系統統一合約 (F3 接縫)。
 *
 * 新增一個系統 = SYSTEM_IDS 加一項 + lib/ai/prompts/systems.ts FRAMING 加一項
 *   + 實作 DivinationSystem 並在 lib/divination/index.ts register;前兩項漏了 tsc 會紅。
 *   有獨立頁面的另在 lib/site.ts PAGE_SLUGS 加一項(導覽、首頁、sitemap 由它產生)。
 *   移除 = 反向刪除。其餘程式(AI 解讀、付費牆)透過 InterpretationContext 這個
 *   「系統無關」結構運作,不需認識各系統內部。
 */

/** 系統清單唯一來源(API 白名單 /api/interpret 亦由此驗證)。 */
export const SYSTEM_IDS = [
  'ziwei',
  'bazi',
  'iching',
  'tarot',
  'astrology',
  'hehun',
  'fengshui',
  'qimen',
  'qian',
  'zeri',
  'vedic',
] as const;
export type SystemId = (typeof SYSTEM_IDS)[number];

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
