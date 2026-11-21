import { computeDailyFortune, dailyContext, type DailyFortune } from '@/lib/daily';
import type { BaziRequest } from '@/lib/bazi';
import type { Ymd } from '@/lib/today';
import { BIRTH_FIELDS, DATE, EXAMPLE_BIRTH, birthDateErrors, toBirth, toYmd } from '../fields';
import type { InputSpec } from '../input';
import type { DivinationSystem } from '../types';

/** 每日運勢(八字喜用神 + 當日黃曆)。日期一律由呼叫端給:伺服器沒有「使用者的今天」。 */
export interface DailyInput {
  birth: BaziRequest;
  date: Ymd;
}

const DAILY_INPUT: InputSpec<DailyInput> = {
  fields: { ...BIRTH_FIELDS, date: DATE('要看的那一天(呼叫端的今天)', 'The day to read (the caller\'s today)') },
  check: (v) => birthDateErrors(v),
  build: (v) => {
    const date = toYmd(v.date);
    return { birth: { ...toBirth(v), asOf: date }, date };
  },
  example: { ...EXAMPLE_BIRTH, date: { year: 2026, month: 11, day: 21 } },
};

export const dailySystem: DivinationSystem<DailyInput, DailyFortune> = {
  meta: { id: 'daily', kind: 'chart', requiresApiKey: false },
  input: DAILY_INPUT,
  async compute(input, locale) {
    const data = computeDailyFortune(input.birth, input.date, locale);
    return { data, context: dailyContext(data, locale) };
  },
};
