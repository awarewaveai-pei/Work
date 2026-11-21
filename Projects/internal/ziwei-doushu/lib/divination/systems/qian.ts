import { drawQian, QIAN_GRADES, QIAN_LOTS, QIAN_TOPICS, type QianLot, type QianTopic } from '@/lib/qian';
import { secureInt } from '@/lib/random';
import type { Locale } from '@/lib/i18n/config';
import type { DivinationSystem, InterpretationContext } from '../types';
import type { InputSpec } from '../input';

export interface QianInput {
  /** 提問主題;不給為綜合 */
  topic?: QianTopic;
  /** 可注入亂數源以利測試;預設密碼學亂數 */
  rng?: () => number;
  /** 呼叫端自帶的籤號(1–100),給了就不抽,可重現 */
  lot?: number;
}

const QIAN_INPUT: InputSpec<QianInput> = {
  fields: {
    topic: {
      type: 'enum',
      values: Object.keys(QIAN_TOPICS),
      required: false,
      doc: { 'zh-TW': '所問主題(預設 general 綜合)', en: 'Topic (default general)' },
    },
    lot: {
      type: 'integer',
      min: 1,
      max: QIAN_LOTS.length,
      required: false,
      doc: { 'zh-TW': '自帶籤號;不給由伺服器以密碼學亂數抽', en: 'Your own lot number; omitted = drawn with a cryptographic random source' },
    },
  },
  build: (v) => ({ topic: v.topic as QianTopic | undefined, lot: v.lot as number | undefined }),
  example: { topic: 'career', lot: 23 },
};

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
  input: QIAN_INPUT,
  async compute(input, locale) {
    const data = input.lot ? QIAN_LOTS[input.lot - 1] : drawQian(input.rng ?? (() => secureInt(QIAN_LOTS.length) / QIAN_LOTS.length));
    return { data, context: toContext(data, locale, input.topic) };
  },
};
