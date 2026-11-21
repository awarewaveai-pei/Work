import { castHexagram, type IChingResult } from '@/lib/iching';
import { HEXAGRAM_TEXTS } from '@/lib/iching/text';
import { READING_RULE_TEXT, selectReading } from '@/lib/iching/reading';
import type { Locale } from '@/lib/i18n/config';
import type { DivinationSystem, InterpretationContext } from '../types';

export interface IChingInput {
  question: string;
  /** 可注入亂數源以利測試;預設 Math.random */
  rng?: () => number;
}

/**
 * 卦象 → AI context。經文一律中文原文(英文頁也是),來自 lib/iching/text.ts;
 * 該讀哪幾段由 selectReading 決定,AI 只能引用這裡給的經文。
 */
export function toContext(r: IChingResult, locale: Locale): InterpretationContext {
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
  return {
    systemId: 'iching',
    locale,
    headline: r.changed ? `${r.primary.name} → ${r.changed.name}` : r.primary.name,
    facts,
  };
}

export const ichingSystem: DivinationSystem<IChingInput, IChingResult> = {
  meta: { id: 'iching', kind: 'draw', requiresApiKey: false },
  async compute(input, locale) {
    const data = castHexagram(input.question, input.rng);
    return { data, context: toContext(data, locale) };
  },
};
