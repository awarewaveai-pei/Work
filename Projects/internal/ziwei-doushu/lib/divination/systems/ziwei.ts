import {
  computeChart,
  type ChartRequest,
  type ChartResult,
} from '@/lib/ziwei';
import type { Locale } from '@/lib/i18n/config';
import type { DivinationSystem, InterpretationContext } from '../types';

/**
 * 紫微斗數系統 adapter — 把既有 computeChart 接上統一 DivinationSystem 合約。
 * 這是 F3 的「垂直證明」:現有引擎不重寫,只用 adapter 接縫。
 */
function toContext(result: ChartResult, locale: Locale): InterpretationContext {
  const a = result.astrolabe;
  const facts: { label: string; value: string }[] = [
    { label: 'soul', value: String(a.soul) },
    { label: 'body', value: String(a.body) },
    { label: 'fiveElements', value: String(a.fiveElementsClass) },
    { label: 'zodiac', value: String(a.zodiac) },
    { label: 'sign', value: String(a.sign) },
    { label: 'fourPillars', value: String(a.chineseDate) },
    { label: 'solarDate', value: String(a.solarDate) },
    { label: 'lunarDate', value: String(a.lunarDate) },
  ];
  // 各宮主星 → 讓 AI 能寫「綁具體星曜」的解讀(非空泛巴納姆)
  for (const p of a.palaces) {
    const stars = p.majorStars.map((s) => s.name).join('/');
    facts.push({ label: `palace:${p.name}`, value: stars || '—' });
  }
  return {
    systemId: 'ziwei',
    locale,
    headline: `${String(a.soul)} · ${String(a.fiveElementsClass)}`,
    facts,
  };
}

export const ziweiSystem: DivinationSystem<ChartRequest, ChartResult> = {
  meta: { id: 'ziwei', kind: 'chart', requiresApiKey: false },
  async compute(input, locale) {
    const data = computeChart({ ...input, locale });
    return { data, context: toContext(data, locale) };
  },
};
