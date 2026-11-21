import { castHexagram, hexagramFromSums, type IChingResult } from '@/lib/iching';
import { secureInt } from '@/lib/random';
import { HEXAGRAM_TEXTS } from '@/lib/iching/text';
import { READING_RULE_TEXT, selectReading } from '@/lib/iching/reading';
import { dayGanZhiOf, lineFact, najiaChart, type NajiaChart } from '@/lib/iching/najia';
import { localToday, type Ymd } from '@/lib/today';
import type { Locale } from '@/lib/i18n/config';
import type { DivinationSystem, InterpretationContext } from '../types';
import { DATE, toYmd } from '../fields';
import type { InputSpec } from '../input';

export interface IChingInput {
  question: string;
  /** 可注入亂數源以利測試;預設密碼學亂數 */
  rng?: () => number;
  /** 呼叫端自帶的六個爻值(由下而上,6/7/8/9),給了就不擲,可重現 */
  lines?: readonly number[];
  /** 起卦日(取日干支排六神、旬空);預設使用者所在時區的今天 */
  date?: Ymd;
}

/** 起卦結果 → 納甲整盤(起卦日以國曆日 0 時換日)。 */
export function najiaOf(r: IChingResult, date: Ymd = localToday()): NajiaChart {
  return najiaChart(r.primary.lines, r.movingLines, dayGanZhiOf(date));
}

/**
 * 卦象 → AI context。經文一律中文原文(英文頁也是),來自 lib/iching/text.ts;
 * 該讀哪幾段由 selectReading 決定,AI 只能引用這裡給的經文。
 */
export function toContext(r: IChingResult, locale: Locale, najia?: NajiaChart): InterpretationContext {
  const facts: { label: string; value: string }[] = [
    { label: 'question', value: r.question },
    { label: 'primary', value: `${r.primary.name}(第${r.primary.number}卦)` },
  ];
  if (r.changed) {
    facts.push({ label: 'changed', value: `${r.changed.name}(第${r.changed.number}卦)` });
  }
  facts.push({
    label: 'movingLines',
    value: r.movingLines.length
      ? r.movingLines.map((i) => `第${i + 1}爻`).join('、')
      : '無動爻',
  });
  facts.push({ label: 'primaryJudgment', value: HEXAGRAM_TEXTS[r.primary.number - 1].judgment });
  if (r.changed) {
    facts.push({ label: 'changedJudgment', value: HEXAGRAM_TEXTS[r.changed.number - 1].judgment });
  }
  const plan = selectReading(r);
  facts.push({ label: 'readingRule', value: READING_RULE_TEXT[plan.rule][locale] });
  plan.passages.forEach((p, i) => {
    const where = p.kind === 'line' ? `line${p.line! + 1}` : p.kind;
    facts.push({ label: `reading${i + 1}.${p.source}.${where}`, value: p.text });
  });
  if (najia) {
    facts.push({
      label: 'najia.palace',
      value: `${najia.palace}宮(${najia.wuxing})${najia.generation}卦,世在第${najia.shi + 1}爻,應在第${najia.ying + 1}爻`,
    });
    facts.push({ label: 'najia.day', value: `起卦日 ${najia.dayGanZhi},旬空 ${najia.xunKong.join('')}` });
    najia.lines.forEach((l) => facts.push({ label: `najia.line${l.index + 1}`, value: lineFact(l) }));
  }
  return {
    systemId: 'iching',
    locale,
    headline: r.changed ? `${r.primary.name} → ${r.changed.name}` : r.primary.name,
    facts,
  };
}

const ICHING_INPUT: InputSpec<IChingInput> = {
  fields: {
    question: { type: 'string', maxLength: 500, doc: { 'zh-TW': '所問之事', en: 'The question' } },
    date: DATE('起卦日(呼叫端的今天;排六神、旬空)', 'Casting date (the caller\'s today; sets the six spirits and void branches)'),
    lines: {
      type: 'array',
      minItems: 6,
      maxItems: 6,
      required: false,
      items: { type: 'integer', min: 6, max: 9, doc: { 'zh-TW': '爻值', en: 'Line value' } },
      doc: {
        'zh-TW': '自帶六個爻值(由下而上,6 老陰、7 少陽、8 少陰、9 老陽);不給由伺服器以密碼學亂數擲錢',
        en: 'Your own six line values, bottom to top (6 old yin, 7 young yang, 8 young yin, 9 old yang); omitted = the server casts with a cryptographic random source',
      },
    },
  },
  build: (v) => ({ question: v.question as string, date: toYmd(v.date), lines: v.lines as number[] | undefined }),
  example: { question: '今年換工作好嗎?', date: { year: 2026, month: 11, day: 21 }, lines: [7, 8, 9, 7, 6, 8] },
};

/** 擲一枚銅錢:正反各半。 */
const coin = () => secureInt(2) / 2;

export const ichingSystem: DivinationSystem<IChingInput, IChingResult> = {
  meta: { id: 'iching', kind: 'draw', requiresApiKey: false },
  input: ICHING_INPUT,
  async compute(input, locale) {
    const data = input.lines
      ? hexagramFromSums(input.question, input.lines)
      : castHexagram(input.question, input.rng ?? coin);
    return { data, context: toContext(data, locale, najiaOf(data, input.date)) };
  },
};
