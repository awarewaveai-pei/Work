import { computeBazi, type BaziRequest, type BaziResult } from '@/lib/bazi';
import type { Locale } from '@/lib/i18n/config';
import type { DivinationSystem, InterpretationContext } from '../types';

export function toContext(r: BaziResult, locale: Locale): InterpretationContext {
  const p = r.pillars;
  const a = r.analysis;
  const facts: { label: string; value: string }[] = [
    { label: 'dayMaster', value: r.dayMaster },
    { label: 'dayElement', value: a.dayElement },
    { label: 'zodiac', value: r.zodiac },
    { label: 'yearPillar', value: `${p.year.ganZhi}(${p.year.shiShen})` },
    { label: 'monthPillar', value: `${p.month.ganZhi}(${p.month.shiShen})` },
    { label: 'dayPillar', value: `${p.day.ganZhi}(${p.day.shiShen})` },
    { label: 'hourPillar', value: `${p.hour.ganZhi}(${p.hour.shiShen})` },
    { label: 'dayNaYin', value: p.day.naYin },
    { label: 'pattern', value: a.pattern },
    { label: 'strength', value: a.strength },
    { label: 'favorable', value: a.favorable.join('、') },
    { label: 'avoid', value: a.avoid.join('、') },
  ];
  return {
    systemId: 'bazi',
    locale,
    headline: `${r.dayMaster} · ${a.pattern} · 喜${a.favorable.join('')}`,
    facts,
  };
}

export const baziSystem: DivinationSystem<BaziRequest, BaziResult> = {
  meta: { id: 'bazi', kind: 'chart', requiresApiKey: false },
  async compute(input, locale) {
    const data = computeBazi({ ...input, locale });
    return { data, context: toContext(data, locale) };
  },
};
