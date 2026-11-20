import { drawQian, QIAN_GRADES, QIAN_TOPICS, type QianLot, type QianTopic } from '@/lib/qian';
import type { Locale } from '@/lib/i18n/config';
import type { DivinationSystem, InterpretationContext } from '../types';

export interface QianInput {
  /** 提問主題;不給為綜合 */
  topic?: QianTopic;
  /** 可注入亂數源以利測試;預設 Math.random */
  rng?: () => number;
}

/** 籤 → AI context。籤詩一律保留中文原文(英文頁也是),AI 依原詩敘事。 */
export function toContext(
  lot: QianLot,
  locale: Locale,
  topic: QianTopic = 'general',
): InterpretationContext {
  const no = locale === 'en' ? `Lot ${lot.no}` : `第 ${lot.no} 籤`;
  return {
    systemId: 'qian',
    locale,
    headline: `${no} · ${lot.title} · ${QIAN_GRADES[lot.grade][locale]}`,
    facts: [
      { label: 'lotNumber', value: String(lot.no) },
      { label: 'lotTitle', value: lot.title },
      { label: 'grade', value: QIAN_GRADES[lot.grade][locale] },
      ...lot.poem.map((line, i) => ({ label: `poemLine${i + 1}`, value: line })),
      { label: 'topic', value: QIAN_TOPICS[topic][locale] },
    ],
  };
}

export const qianSystem: DivinationSystem<QianInput, QianLot> = {
  meta: { id: 'qian', kind: 'draw', requiresApiKey: false },
  async compute(input, locale) {
    const data = drawQian(input.rng);
    return { data, context: toContext(data, locale, input.topic) };
  },
};
