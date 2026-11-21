import {
  drawDaily,
  drawSpread,
  SPREADS,
  TOPICS,
  type TarotResult,
  type SpreadId,
  type TarotTopic,
} from '@/lib/tarot';
import { computeTarotRelations, describeRelations } from '@/lib/tarotRelations';
import type { Ymd } from '@/lib/today';
import type { Locale } from '@/lib/i18n/config';
import type { DivinationSystem, InterpretationContext } from '../types';

export interface TarotInput {
  spread: SpreadId;
  /** 情境化卡義主題(感情/事業/…);不給為綜合 */
  topic?: TarotTopic;
  /** 每日一牌:帶當天本地日期,同日同牌(忽略 spread / rng) */
  daily?: Ymd;
  /** 可注入亂數源以利測試;預設密碼學亂數 */
  rng?: () => number;
}

function orient(reversed: boolean, locale: Locale): string {
  if (locale === 'en') return reversed ? 'reversed' : 'upright';
  return reversed ? '逆位' : '正位';
}

/**
 * 塔羅 → AI context。Phase C 強化:每張牌綁「牌位含義」(過去/現在/未來、
 *   你/對方/關係…)+ 情境主題 → AI 能依牌位 + 主題給情境化解讀,而非只列牌名。
 */
export function toContext(
  r: TarotResult,
  locale: Locale,
  topic?: TarotTopic,
): InterpretationContext {
  const spread = SPREADS[r.spread];
  const positions = spread.positions[locale];

  const facts: { label: string; value: string }[] = [
    { label: 'spread', value: spread.name[locale] },
  ];
  if (r.daily) {
    const { year, month, day } = r.daily;
    facts.push({ label: 'mode', value: `${locale === 'en' ? 'Card of the day' : '每日一牌'} ${year}-${month}-${day}` });
  }
  if (topic) facts.push({ label: 'topic', value: TOPICS[topic][locale] });
  r.cards.forEach((d, i) => {
    facts.push({
      label: `position:${positions[i] ?? `#${i + 1}`}`,
      value: `${d.card.name[locale]}(${orient(d.reversed, locale)})`,
    });
  });
  // 牌間關係由確定性程式算好,AI 只負責敘事(單張牌無關係)
  for (const line of describeRelations(computeTarotRelations(r.cards), r.cards, locale)) {
    facts.push({ label: line.key, value: line.text });
  }

  return {
    systemId: 'tarot',
    locale,
    headline: `${r.daily ? (locale === 'en' ? 'Card of the day' : '每日一牌') : spread.name[locale]}${topic ? ` · ${TOPICS[topic][locale]}` : ''}`,
    facts,
  };
}

export const tarotSystem: DivinationSystem<TarotInput, TarotResult> = {
  meta: { id: 'tarot', kind: 'draw', requiresApiKey: false },
  async compute(input, locale) {
    const data = input.daily ? drawDaily(input.daily) : drawSpread(input.spread, input.rng);
    return { data, context: toContext(data, locale, input.topic) };
  },
};
