import type { SystemId } from '@/lib/divination/types';
import type { Locale } from '@/lib/i18n/config';

/**
 * 兩段式 AI 解讀(卡 Z2;SPEC §8)的系統無關型別:免費簡批 + 付費深度報告。
 * 各系統只要產出一份 ReadingPlan(確定性,不呼叫 AI),生成、結構驗證與事實核對全部共用。
 * 目前只有紫微接上(lib/ziwei/twoStage.ts)。
 */

/** 給模型的一條事實:id 穩定(鉤子、付費清單、核對都用它指回來源)。 */
export interface Fact {
  id: string;
  value: string;
}

/** 結尾鉤子:程式挑出的一條 fact;模型只能為這些 key 各寫一句懸念。 */
export interface HookItem {
  /** H1…H4 */
  key: string;
  factId: string;
  /** 該 fact 的文字(寫進提示詞,讓模型知道要寫哪件事) */
  fact: string;
}

/** 「付費可得知的內容」清單一項:程式組字,附對得到的 fact id。 */
export interface PaidItem {
  text: string;
  factIds: string[];
}

export interface ReadingChapter {
  id: string;
  title: string;
  facts: Fact[];
}

export interface ReadingPlan {
  systemId: SystemId;
  locale: Locale;
  headline: string;
  /** 簡批固定段落標題(依序) */
  sections: string[];
  briefFacts: Fact[];
  /** 免費附贈的完整段(與付費同深度);null = 這張盤沒有可寫的 */
  bonus: { heading: string; factIds: string[] } | null;
  hooks: HookItem[];
  paidList: PaidItem[];
  chapters: ReadingChapter[];
}

/** 一次模型呼叫的 token 用量(成本估算用)。 */
export interface Usage {
  model: string;
  input: number;
  cachedInput: number;
  output: number;
}

export interface LlmRequest {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  effort: 'low' | 'medium' | 'high';
}

export interface LlmResult {
  text: string;
  usage: Usage;
}

/** 模型呼叫接縫:正式走 OpenAI(lib/ai/providers/openai.ts openaiComplete),測試注入假的。 */
export type Llm = (req: LlmRequest) => Promise<LlmResult>;
