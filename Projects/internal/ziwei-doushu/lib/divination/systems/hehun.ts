import { computeBazi, type BaziRequest, type BaziResult } from '@/lib/bazi';
import {
  animalOf,
  dominantElements,
  matchBazi,
  matchZodiac,
  yearBranchOf,
  RELATION_ZH,
  type HehunKey,
  type HehunMatch,
} from '@/lib/hehun';
import type { Locale } from '@/lib/i18n/config';
import type { DivinationSystem, InterpretationContext } from '../types';
import { BIRTH_FIELDS, DATE, EXAMPLE_BIRTH, birthDateErrors, toBirth, toYmd } from '../fields';
import { isRealDate, type FieldSpec, type Fields, type InputSpec } from '../input';

/** 只用出生年模式:需要月日才能判斷立春前後。 */
export interface BirthDay {
  year: number;
  month: number;
  day: number;
}

export type HehunInput =
  | { mode: 'full'; a: BaziRequest; b: BaziRequest }
  | { mode: 'zodiac'; a: BirthDay; b: BirthDay };

export type HehunData =
  | { mode: 'full'; a: BaziResult; b: BaziResult; match: HehunMatch }
  | { mode: 'zodiac'; a: { yearZhi: string }; b: { yearZhi: string }; match: HehunMatch };

export function computeHehun(input: HehunInput, locale: Locale): HehunData {
  if (input.mode === 'zodiac') {
    const za = yearBranchOf(input.a.year, input.a.month, input.a.day);
    const zb = yearBranchOf(input.b.year, input.b.month, input.b.day);
    return { mode: 'zodiac', a: { yearZhi: za }, b: { yearZhi: zb }, match: matchZodiac(za, zb) };
  }
  const a = computeBazi({ ...input.a, locale });
  const b = computeBazi({ ...input.b, locale });
  return { mode: 'full', a, b, match: matchBazi(a, b) };
}

function personFacts(tag: '甲' | '乙', r: BaziResult) {
  const p = r.pillars;
  return [
    { label: `${tag}:pillars`, value: `${p.year.ganZhi} ${p.month.ganZhi} ${p.day.ganZhi} ${p.hour.ganZhi}` },
    { label: `${tag}:zodiac`, value: animalOf(p.year.zhi) },
    { label: `${tag}:dayMaster`, value: `${r.dayMaster}(${r.analysis.dayElement})` },
    { label: `${tag}:strength`, value: r.analysis.strength },
    { label: `${tag}:favorable`, value: r.analysis.favorable.join('、') },
    { label: `${tag}:avoid`, value: r.analysis.avoid.join('、') },
    { label: `${tag}:dominant`, value: dominantElements(r).join('、') },
  ];
}

/** facts 的 item label:方向寫明,避免 AI 把「乙方補甲方」讀反。 */
const ITEM_LABEL: Record<HehunKey, string> = {
  yearBranch: 'item:年支生肖',
  dayStem: 'item:日干',
  dayBranch: 'item:日支',
  elementsAB: 'item:五行互補(乙方補甲方喜用)',
  elementsBA: 'item:五行互補(甲方補乙方喜用)',
  yearNaYin: 'item:年柱納音',
};

/**
 * 事實用命理通用記法(繁中);AI 依 locale 敘事。全模式約 22 條,遠低於 60 上限。
 * 彙總與各項排在最前:分享卡(lib/og.ts)只取前幾筆 value。
 */
export function toContext(d: HehunData, locale: Locale): InterpretationContext {
  const s = d.match.summary;
  const facts: { label: string; value: string }[] = [
    { label: 'summary', value: `${s.合}合 ${s.平}平 ${s.沖}沖` },
  ];
  for (const it of d.match.items) {
    const rel = it.basis.relations.map((r) => RELATION_ZH[r]).join('、') || '無特別關係';
    facts.push({ label: ITEM_LABEL[it.key], value: `${it.verdict}|${it.basis.a} / ${it.basis.b}|${rel}` });
  }
  facts.push({ label: 'mode', value: d.mode === 'full' ? '八字合婚' : '生肖配對' });
  if (d.mode === 'full') {
    facts.push(...personFacts('甲', d.a), ...personFacts('乙', d.b));
  } else {
    facts.push(
      { label: '甲:zodiac', value: `${d.a.yearZhi}(${animalOf(d.a.yearZhi)})` },
      { label: '乙:zodiac', value: `${d.b.yearZhi}(${animalOf(d.b.yearZhi)})` },
    );
  }
  return {
    systemId: 'hehun',
    locale,
    headline: `${d.mode === 'full' ? '八字合婚' : '生肖配對'} · ${s.合}合 ${s.平}平 ${s.沖}沖`,
    facts,
  };
}

/** 兩種模式共用一組欄位:年月日必填,其餘在 full 模式由 check 要求。 */
const PERSON_FIELDS: Fields = Object.fromEntries(
  Object.entries(BIRTH_FIELDS).map(([k, f]) => [k, ['year', 'month', 'day'].includes(k) ? f : { ...f, required: false }]),
);
const person = (zh: string, en: string): FieldSpec => ({
  type: 'object',
  fields: PERSON_FIELDS,
  doc: { 'zh-TW': `${zh}(zodiac 模式只看年月日;full 模式出生資料全填)`, en: `${en} (zodiac mode reads only the date; full mode needs the whole birth record)` },
});
const FULL_REQUIRED = ['calendar', 'hour', 'minute', 'gender', 'place'];

const HEHUN_INPUT: InputSpec<HehunInput> = {
  fields: {
    mode: { type: 'enum', values: ['full', 'zodiac'], doc: { 'zh-TW': 'full 八字合婚 / zodiac 只用出生日期', en: 'full = BaZi match, zodiac = birth date only' } },
    a: person('甲方', 'Person A'),
    b: person('乙方', 'Person B'),
    asOf: DATE('流年基準日(呼叫端的今天;full 模式必填)', 'Reference date for the current year (the caller\'s today; required in full mode)', false),
  },
  check: (v) => [
    ...(v.mode === 'full' && v.asOf === undefined ? ['asOf: required in full mode'] : []),
    ...(['a', 'b'] as const).flatMap((k) => {
      const p = v[k] as Record<string, unknown>;
      if (v.mode === 'zodiac') {
        if (p.calendar === 'lunar') return [`${k}.calendar: zodiac mode takes solar (Gregorian) dates`];
        return isRealDate(p.year as number, p.month as number, p.day as number) ? [] : [`${k}.day: no such date`];
      }
      const missing = FULL_REQUIRED.filter((f) => p[f] === undefined).map((f) => `${k}.${f}: required in full mode`);
      return missing.length ? missing : birthDateErrors(p, k);
    }),
  ],
  build: (v) => {
    const a = v.a as Record<string, unknown>;
    const b = v.b as Record<string, unknown>;
    if (v.mode === 'zodiac') return { mode: 'zodiac', a: toYmd(a), b: toYmd(b) };
    const asOf = toYmd(v.asOf);
    return { mode: 'full', a: { ...toBirth(a), asOf }, b: { ...toBirth(b), asOf } };
  },
  example: {
    mode: 'full',
    a: EXAMPLE_BIRTH,
    b: { ...EXAMPLE_BIRTH, year: 1998, month: 3, day: 2, hour: 9, minute: 15, gender: '男' },
    asOf: { year: 2026, month: 11, day: 21 },
  },
};

export const hehunSystem: DivinationSystem<HehunInput, HehunData> = {
  meta: { id: 'hehun', kind: 'chart', requiresApiKey: false },
  input: HEHUN_INPUT,
  async compute(input, locale) {
    const data = computeHehun(input, locale);
    return { data, context: toContext(data, locale) };
  },
};
