import { castHexagram, type IChingResult } from '@/lib/iching';
import type { Locale } from '@/lib/i18n/config';
import type { DivinationSystem, InterpretationContext } from '../types';

export interface IChingInput {
  question: string;
  /** 可注入亂數源以利測試;預設 Math.random */
  rng?: () => number;
}

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
