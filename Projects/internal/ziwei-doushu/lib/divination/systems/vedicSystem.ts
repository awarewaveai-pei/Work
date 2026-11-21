import { computeSiderealPositions, type WesternRequest } from '@/lib/astrology';
import { buildVedicChart, type VedicChart } from '@/lib/vedic';
import type { Ymd } from '@/lib/today';
import { DATE, EXAMPLE_WESTERN_BIRTH, WESTERN_BIRTH_FIELDS, toWesternRequest, toYmd } from '../fields';
import { isRealDate, type InputSpec } from '../input';
import type { DivinationSystem } from '../types';
import { vedicContext } from './vedic';

/**
 * 吠陀本命盤的系統物件。與 ./vedic.ts 分檔:那個檔給瀏覽器端 VedicTool 用,
 * 本檔經 lib/astrology.ts 讀 XALEN wasm 檔,只能在伺服器端載入。
 */
export interface VedicInput {
  birth: WesternRequest;
  /** 目前大運、小運要用的「今天」;由呼叫端給 */
  date: Ymd;
}

const VEDIC_INPUT: InputSpec<VedicInput> = {
  fields: {
    ...WESTERN_BIRTH_FIELDS,
    date: DATE('目前大運、小運用的日期(呼叫端的今天)', 'Date for the current dasha periods (the caller\'s today)'),
  },
  check: (v) => (isRealDate(v.year as number, v.month as number, v.day as number) ? [] : ['day: no such date']),
  build: (v) => ({ birth: toWesternRequest(v), date: toYmd(v.date) }),
  example: { ...EXAMPLE_WESTERN_BIRTH, date: { year: 2026, month: 11, day: 21 } },
};

export const vedicSystem: DivinationSystem<VedicInput, VedicChart> = {
  meta: { id: 'vedic', kind: 'chart', requiresApiKey: false },
  input: VEDIC_INPUT,
  async compute(input, locale) {
    const data = buildVedicChart(computeSiderealPositions(input.birth), input.birth.tzOffsetHours);
    return { data, context: vedicContext(data, locale, input.date) };
  },
};
