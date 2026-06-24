import { computeBazi, type BaziRequest, type BaziResult } from '@/lib/bazi';
import type { Locale } from '@/lib/i18n/config';
import type { DivinationSystem, InterpretationContext } from '../types';

function toContext(r: BaziResult, locale: Locale): InterpretationContext {
  const p = r.pillars;
  const facts: { label: string; value: string }[] = [
    { label: 'dayMaster', value: r.dayMaster },
    { label: 'zodiac', value: r.zodiac },
    { label: 'yearPillar', value: `${p.year.ganZhi}(${p.year.shiShen})` },
    { label: 'monthPillar', value: `${p.month.ganZhi}(${p.month.shiShen})` },
    { label: 'dayPillar', value: `${p.day.ganZhi}(${p.day.shiShen})` },
    { label: 'hourPillar', value: `${p.hour.ganZhi}(${p.hour.shiShen})` },
    { label: 'dayNaYin', value: p.day.naYin },
  ];
  return {
    systemId: 'bazi',
    locale,
    headline: `${r.dayMaster} · ${p.day.naYin}`,
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
