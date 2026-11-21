import { parseInput } from '@/lib/divination/input';
import type { DivinationSystem, InterpretationContext } from '@/lib/divination/types';
import type { Locale } from '@/lib/i18n/config';

export type RunResult =
  | { ok: true; data: unknown; context: InterpretationContext }
  | { ok: false; error: 'invalid_input'; detail: string[] }
  | { ok: false; error: 'compute_failed'; detail: string };

/**
 * 單次與批次共用:驗證一筆輸入並計算。錯誤只回欄位路徑與訊息,不回輸入值(出生資料不進回應以外的任何地方)。
 * data 經 JSON 來回一次:紫微 astrolabe 等功能物件在這裡經自己的 toJSON() 變成純 JSON。
 */
export async function runOne(system: DivinationSystem, input: unknown, locale: Locale): Promise<RunResult> {
  try {
    const parsed = parseInput(system.input, input);
    if (!parsed.ok) {
      return { ok: false, error: 'invalid_input', detail: parsed.errors.map((e) => (e.startsWith('input:') ? e : `input.${e}`)) };
    }
    const { data, context } = await system.compute(parsed.value, locale);
    return { ok: true, data: JSON.parse(JSON.stringify(data)), context };
  } catch {
    return { ok: false, error: 'compute_failed', detail: 'the engine could not compute this input' };
  }
}
