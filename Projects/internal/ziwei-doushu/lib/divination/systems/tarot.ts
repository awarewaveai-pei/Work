import { drawSpread, type TarotResult, type SpreadId } from '@/lib/tarot';
import type { Locale } from '@/lib/i18n/config';
import type { DivinationSystem, InterpretationContext } from '../types';

export interface TarotInput {
  spread: SpreadId;
  /** 可注入亂數源以利測試;預設 Math.random */
  rng?: () => number;
}

function orient(reversed: boolean, locale: Locale): string {
  if (locale === 'en') return reversed ? 'reversed' : 'upright';
  return reversed ? '逆位' : '正位';
}

function toContext(r: TarotResult, locale: Locale): InterpretationContext {
  const facts = r.cards.map((d, i) => ({
    label: `card${i + 1}`,
    value: `${d.card.name[locale]}(${orient(d.reversed, locale)})`,
  }));
  return {
    systemId: 'tarot',
    locale,
    headline: r.cards.map((d) => d.card.name[locale]).join('、'),
    facts,
  };
}

export const tarotSystem: DivinationSystem<TarotInput, TarotResult> = {
  meta: { id: 'tarot', kind: 'draw', requiresApiKey: false },
  async compute(input, locale) {
    const data = drawSpread(input.spread, input.rng);
    return { data, context: toContext(data, locale) };
  },
};
