import { computeWesternChart, type WesternChart } from '@/lib/astrology';
import { traditionalReading, type TraditionalReading } from '@/lib/astrologyTraditional';
import { astrologyContext } from '@/lib/astrologyView';
import type { Ymd } from '@/lib/today';
import { ASTROLOGY_BIRTH_FIELDS, DATE, EXAMPLE_WESTERN_BIRTH, toWesternRequest, toYmd } from '../fields';
import { isRealDate, type InputSpec } from '../input';
import type { WesternRequest } from '@/lib/astrology';
import type { DivinationSystem } from '../types';

/**
 * 西洋占星本命盤(XALEN wasm)。只在伺服器端載入:lib/astrology.ts 讀 wasm 檔,瀏覽器端元件不可 import 本檔。
 * 行運、合盤、時間主星仍在 /api/astrology/* 與頁面,v1 只開本命盤與傳統技法。
 */
export interface AstrologyInput {
  birth: WesternRequest;
  /** 小限(年度宮位)要用的「今天」;由呼叫端給 */
  date: Ymd;
}

export interface AstrologyData {
  chart: WesternChart;
  /** 日月或上升缺資料時為 null */
  traditional: TraditionalReading | null;
}

const ASTROLOGY_INPUT: InputSpec<AstrologyInput> = {
  fields: {
    ...ASTROLOGY_BIRTH_FIELDS,
    date: DATE('小限(年度宮位)用的日期(呼叫端的今天)', 'Date for the annual profection (the caller\'s today)'),
  },
  check: (v) => (isRealDate(v.year as number, v.month as number, v.day as number) ? [] : ['day: no such date']),
  build: (v) => ({ birth: toWesternRequest(v), date: toYmd(v.date) }),
  example: { ...EXAMPLE_WESTERN_BIRTH, date: { year: 2026, month: 11, day: 21 } },
};

export const astrologySystem: DivinationSystem<AstrologyInput, AstrologyData> = {
  meta: { id: 'astrology', kind: 'chart', requiresApiKey: false },
  input: ASTROLOGY_INPUT,
  async compute(input, locale) {
    const chart = computeWesternChart(input.birth);
    const traditional = traditionalReading(chart, input.birth, input.date);
    return { data: { chart, traditional }, context: astrologyContext(chart, locale, traditional) };
  },
};
