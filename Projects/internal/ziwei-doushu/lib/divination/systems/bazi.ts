import { computeBazi, type BaziRequest, type BaziResult } from '@/lib/bazi';
import { relationTerm, type PillarPosition, type RelationKind } from '@/lib/baziRelations';
import type { Locale } from '@/lib/i18n/config';
import type { DivinationSystem, InterpretationContext } from '../types';
import { BIRTH_FIELDS, DATE, EXAMPLE_BIRTH, birthDateErrors, toBirth, toYmd } from '../fields';
import type { InputSpec } from '../input';

const POS: Record<Locale, Record<PillarPosition, string>> = {
  'zh-TW': { year: '年', month: '月', day: '日', hour: '時' },
  en: { year: 'year', month: 'month', day: 'day', hour: 'hour' },
};

/** 合沖刑害 fact label(穩定英文,每類一條;未命中不列)。 */
const RELATION_LABEL: Record<RelationKind, string> = {
  ganHe: 'stemCombinations',
  liuHe: 'branchSixCombinations',
  sanHe: 'branchTripleCombinations',
  chong: 'branchClashes',
  xing: 'branchPunishments',
  hai: 'branchHarms',
};

function luckFacts(r: BaziResult, locale: Locale): { label: string; value: string }[] {
  const l = r.luck;
  const zh = locale === 'zh-TW';
  const { years, months, days } = l.start;
  const step = (i: number) => {
    const s = l.steps[i];
    return zh
      ? `${s.ganZhi}(虛歲${s.startAge}–${s.endAge},${s.startYear}–${s.endYear})`
      : `${s.ganZhi} (nominal age ${s.startAge}–${s.endAge}, ${s.startYear}–${s.endYear})`;
  };
  return [
    {
      label: 'luckStart',
      value: zh
        ? `${l.forward ? '順排' : '逆排'},出生後${years}年${months}月${days}日起運`
        : `${l.forward ? 'forward' : 'backward'}; luck pillars begin ${years}y ${months}m ${days}d after birth`,
    },
    { label: 'luckPillars', value: l.steps.map((_, i) => step(i)).join(zh ? '、' : '; ') },
    {
      label: 'currentLuckPillar',
      value: l.currentIndex === null ? (zh ? '不在八步大運內' : 'outside the eight luck pillars') : step(l.currentIndex),
    },
    { label: 'currentYearPillar', value: `${l.liuNian.year} ${l.liuNian.ganZhi}` },
  ];
}

export function toContext(r: BaziResult, locale: Locale): InterpretationContext {
  const p = r.pillars;
  const a = r.analysis;
  const pos = POS[locale];
  const sep = locale === 'zh-TW' ? '、' : '; ';
  const where = (ps: PillarPosition[]) => ps.map((x) => pos[x]).join('-');

  const relationFacts = (Object.keys(RELATION_LABEL) as RelationKind[]).flatMap((kind) => {
    const hits = r.relations.filter((x) => x.kind === kind);
    if (hits.length === 0) return [];
    return [{ label: RELATION_LABEL[kind], value: hits.map((x) => `${relationTerm(x)}(${where(x.positions)})`).join(sep) }];
  });

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
    {
      label: 'lifeStages',
      value: (['year', 'month', 'day', 'hour'] as const).map((k) => `${pos[k]}:${p[k].diShi}`).join(sep),
    },
    { label: 'dayVoidBranches', value: r.xunKong },
    ...relationFacts,
    {
      label: 'shensha',
      value: r.shensha.length ? r.shensha.map((s) => `${s.name}(${where(s.positions)})`).join(sep) : '—',
    },
    ...luckFacts(r, locale),
  ];
  return {
    systemId: 'bazi',
    locale,
    headline: `${r.dayMaster} · ${a.pattern} · 喜${a.favorable.join('')}`,
    facts,
  };
}

const BAZI_INPUT: InputSpec<BaziRequest> = {
  fields: { ...BIRTH_FIELDS, asOf: DATE('流年、目前大運的基準日(呼叫端的今天)', 'Reference date for the current year and luck pillar (the caller\'s today)') },
  check: (v) => birthDateErrors(v),
  build: (v) => ({ ...toBirth(v), asOf: toYmd(v.asOf) }),
  example: { ...EXAMPLE_BIRTH, asOf: { year: 2026, month: 11, day: 21 } },
};

export const baziSystem: DivinationSystem<BaziRequest, BaziResult> = {
  meta: { id: 'bazi', kind: 'chart', requiresApiKey: false },
  input: BAZI_INPUT,
  async compute(input, locale) {
    const data = computeBazi({ ...input, locale });
    return { data, context: toContext(data, locale) };
  },
};
