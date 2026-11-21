import { computeFeixing, type Direction, type FeixingInput, type FeixingPattern, type FeixingResult } from '@/lib/fengshui/feixing';
import { computeBazhai, type BazhaiInput, type BazhaiResult, type Star } from '@/lib/fengshui/bazhai';
import type { Locale } from '@/lib/i18n/config';
import type { DivinationSystem, InterpretationContext } from '../types';
import { DATE, GENDER_FIELD, toYmd } from '../fields';
import { YEAR_MAX, YEAR_MIN, type InputSpec } from '../input';
import type { Gender } from '@/lib/ziwei';

export interface FengshuiInput extends FeixingInput {
  /** 選填:居住者生日＋性別 → 八宅命卦 */
  occupant?: BazhaiInput;
}

export interface FengshuiResult {
  feixing: FeixingResult;
  bazhai: BazhaiResult | null;
}

export function computeFengshui(input: FengshuiInput): FengshuiResult {
  return {
    feixing: computeFeixing(input),
    bazhai: input.occupant ? computeBazhai(input.occupant) : null,
  };
}

type Words = Record<Locale, string>;

const DIRECTION: Record<Direction, Words> = {
  N: { 'zh-TW': '北', en: 'N' }, NE: { 'zh-TW': '東北', en: 'NE' },
  E: { 'zh-TW': '東', en: 'E' }, SE: { 'zh-TW': '東南', en: 'SE' },
  S: { 'zh-TW': '南', en: 'S' }, SW: { 'zh-TW': '西南', en: 'SW' },
  W: { 'zh-TW': '西', en: 'W' }, NW: { 'zh-TW': '西北', en: 'NW' },
  C: { 'zh-TW': '中宮', en: 'Center' },
};

const PATTERN: Record<FeixingPattern, Words> = {
  wangShanWangXiang: { 'zh-TW': '旺山旺向', en: 'Prosperous sitting and facing' },
  shangShanXiaShui: { 'zh-TW': '上山下水', en: 'Reversed stars (mountain star at facing, facing star at sitting)' },
  shuangXingDaoXiang: { 'zh-TW': '雙星到向', en: 'Double prosperous stars at facing' },
  shuangXingDaoZuo: { 'zh-TW': '雙星到坐', en: 'Double prosperous stars at sitting' },
  none: { 'zh-TW': '當運星未到坐向', en: 'Prosperous stars not at sitting or facing' },
};

const STAR: Record<Star, Words> = {
  shengQi: { 'zh-TW': '生氣', en: 'Sheng Qi (vitality)' },
  tianYi: { 'zh-TW': '天醫', en: 'Tian Yi (restoration)' },
  yanNian: { 'zh-TW': '延年', en: 'Yan Nian (longevity, relationships)' },
  fuWei: { 'zh-TW': '伏位', en: 'Fu Wei (stability)' },
  jueMing: { 'zh-TW': '絕命', en: 'Jue Ming (least supportive)' },
  wuGui: { 'zh-TW': '五鬼', en: 'Wu Gui (friction)' },
  liuSha: { 'zh-TW': '六煞', en: 'Liu Sha (distraction)' },
  huoHai: { 'zh-TW': '禍害', en: 'Huo Hai (minor setbacks)' },
};

const GUA: Record<number, Words> = {
  1: { 'zh-TW': '坎', en: 'Kan' }, 2: { 'zh-TW': '坤', en: 'Kun' }, 3: { 'zh-TW': '震', en: 'Zhen' },
  4: { 'zh-TW': '巽', en: 'Xun' }, 6: { 'zh-TW': '乾', en: 'Qian' }, 7: { 'zh-TW': '兌', en: 'Dui' },
  8: { 'zh-TW': '艮', en: 'Gen' }, 9: { 'zh-TW': '離', en: 'Li' },
};

export function toContext(r: FengshuiResult, locale: Locale): InterpretationContext {
  const zh = locale !== 'en';
  const f = r.feixing;
  const dir = (d: Direction) => DIRECTION[d][locale];
  const facts: { label: string; value: string }[] = [
    { label: 'facing', value: `${f.facing.mountain} ${f.facingDegree}°(${dir(f.palaces[f.facing.palace - 1].direction)})` },
    { label: 'sitting', value: `${f.sitting.mountain}(${dir(f.palaces[f.sitting.palace - 1].direction)})` },
    {
      label: 'period',
      value: zh ? `${f.moveInYear} 年入伙 → ${f.period} 運` : `Moved in ${f.moveInYear} → Period ${f.period}`,
    },
    { label: 'pattern', value: PATTERN[f.pattern][locale] },
  ];
  if (f.facing.jian) {
    facts.push({
      label: 'jian',
      value: zh ? `兼${f.facing.jian},以替卦起星` : `Leaning toward ${f.facing.jian}; replacement stars used`,
    });
  }
  facts.push({
    label: 'annual',
    value: zh ? `${f.flowYear} 年 ${f.annualCenter} 入中` : `${f.flowYear}: star ${f.annualCenter} at center`,
  });
  for (const p of f.palaces) {
    facts.push({
      label: `palace_${p.direction}`,
      value: zh
        ? `${dir(p.direction)}:運${p.period} 山${p.mountain} 向${p.facing} 年${p.annual}`
        : `${dir(p.direction)}: period ${p.period} · mountain ${p.mountain} · facing ${p.facing} · annual ${p.annual}`,
    });
  }

  if (r.bazhai) {
    const b = r.bazhai;
    const group = b.group === 'east' ? (zh ? '東四命' : 'East group') : zh ? '西四命' : 'West group';
    facts.push({ label: 'mingGua', value: `${GUA[b.gua][locale]}(${b.gua})· ${group}` });
    for (const [star, d] of Object.entries(b.stars) as [Star, Direction][]) {
      facts.push({ label: `bazhai_${star}`, value: `${STAR[star][locale]}:${dir(d)}` });
    }
  }

  const headline = zh
    ? `${f.sitting.mountain}山${f.facing.mountain}向 · ${f.period} 運 · ${PATTERN[f.pattern]['zh-TW']}`
    : `${f.sitting.mountain}-sitting ${f.facing.mountain}-facing · Period ${f.period} · ${PATTERN[f.pattern].en}`;

  return { systemId: 'fengshui', locale, headline, facts };
}

const FENGSHUI_INPUT: InputSpec<FengshuiInput> = {
  fields: {
    facingDegree: { type: 'number', min: 0, max: 360, doc: { 'zh-TW': '向的羅盤度數(大門或主要採光面朝向)', en: 'Facing direction in compass degrees (main door or main light side)' } },
    moveIn: DATE('入伙或建成日期(立春換年)', 'Move-in or completion date (year changes at Lichun)'),
    flowYear: { type: 'integer', min: YEAR_MIN, max: YEAR_MAX, doc: { 'zh-TW': '要看的流年(節氣年;呼叫端給)', en: 'Year to read (solar-term year; given by the caller)' } },
    occupant: {
      type: 'object',
      required: false,
      doc: { 'zh-TW': '選填:居住者生日與性別 → 八宅命卦', en: 'Optional: occupant birth date and gender for the Eight Mansions life gua' },
      fields: { birth: DATE('居住者生日', 'Occupant birth date'), gender: GENDER_FIELD },
    },
  },
  build: (v) => {
    const o = v.occupant as Record<string, unknown> | undefined;
    return {
      facingDegree: v.facingDegree as number,
      moveIn: toYmd(v.moveIn),
      flowYear: v.flowYear as number,
      occupant: o ? { birth: toYmd(o.birth), gender: o.gender as Gender } : undefined,
    };
  },
  example: { facingDegree: 180, moveIn: { year: 2015, month: 6, day: 1 }, flowYear: 2026, occupant: { birth: { year: 1985, month: 4, day: 10 }, gender: '女' } },
};

export const fengshuiSystem: DivinationSystem<FengshuiInput, FengshuiResult> = {
  meta: { id: 'fengshui', kind: 'chart', requiresApiKey: false },
  input: FENGSHUI_INPUT,
  async compute(input, locale) {
    const data = computeFengshui(input);
    return { data, context: toContext(data, locale) };
  },
};
