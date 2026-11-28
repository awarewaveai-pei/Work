import type { IFunctionalAstrolabe } from 'iztro/lib/astro/FunctionalAstrolabe';
import { computeChart, computeHoroscope, type ChartRequest } from '@/lib/ziwei';
import { analyzeZiwei } from './analyze';
import { computeZiweiDeepFacts, type ZiweiDeepFacts, type ZiweiFact, type ZiweiFactCategory } from './deep';
import { toContext } from '@/lib/divination/systems/ziwei';
import type { Fact, HookItem, PaidItem, ReadingChapter, ReadingPlan } from '@/lib/ai/twoStage/types';
import type { Vocabulary } from '@/lib/ai/twoStage/factCheck';
import { STAR_PROFILES } from './stars';
import { SIX_LUCKY, SIX_UNLUCKY } from './brightness';
import { PATTERN_NAMES } from './patterns';

/**
 * 紫微兩段式解讀的確定性部分(卡 Z2;SPEC §8):簡批要給模型的 facts、免費附贈段、
 * 結尾鉤子、「付費可得知的內容」清單、深度報告各章的 facts。全部由程式從
 * Z1 facts(computeZiweiDeepFacts)與既有簡批 facts(toContext)挑出,AI 不參與。
 * 決定論:同 (出生資料, today) 輸出相同。只支援 zh-TW(Z1 facts 是中文)。
 */

/** 既有簡批 facts(toContext)英文標籤 → 給模型看的中文名(避免誤讀,值不變)。 */
const BRIEF_LABELS: Record<string, string> = {
  soul: '命主星',
  body: '身主星',
  fiveElements: '五行局',
  zodiac: '生肖',
  sign: '星座',
  fourPillars: '四柱',
  solarDate: '國曆生日',
  lunarDate: '農曆生日',
  birthMutagen: '生年四化',
  decadal: '目前大限四化',
  yearly: '今年流年四化',
};

const SECTIONS = ['命格特質', '感情婚姻', '事業財富', '健康', '人際貴人', '今年運勢'] as const;

/** 鉤子分組:同組只取權重最高的一條,讓 3–4 個鉤子落在不同面向。 */
function hookGroup(f: ZiweiFact): string {
  if (f.category === 'surround') return '化忌落點';
  return f.category;
}

const toFact = (f: ZiweiFact): Fact => ({ id: f.id, value: f.text });

/** 目標日所在的流月 fact(以流月命宮所在宮＋流月天干對應 iztro horoscope 的流月)。 */
export function currentMonthFact(astro: IFunctionalAstrolabe, deep: ZiweiDeepFacts): ZiweiFact | null {
  const m = astro.horoscope(deep.targetDate).monthly;
  const palace = String(astro.palaces[m.index]?.name ?? '');
  return (
    deep.facts.find(
      (f) => f.category === 'monthly' && f.palaces[0] === palace && f.detail.stem === String(m.heavenlyStem),
    ) ?? null
  );
}

/** 免費附贈的完整段:本月流月有標記就寫本月;否則寫最強的格局(吉格優先);都沒有就寫本月。 */
export function pickBonus(deep: ZiweiDeepFacts, month: ZiweiFact | null): { heading: string; facts: ZiweiFact[] } | null {
  const patterns = deep.facts
    .filter((f) => f.category === 'pattern')
    .sort((a, b) => b.weight - a.weight);
  if (month && month.tone !== 'neutral') return { heading: `本月流月（農曆${month.detail.month}月）`, facts: [month] };
  if (patterns.length) return { heading: `格局精讀：${patterns[0].id.slice('pattern:'.length)}`, facts: [patterns[0]] };
  if (month) return { heading: `本月流月（農曆${month.detail.month}月）`, facts: [month] };
  return null;
}

/**
 * 結尾鉤子:候選 = hook 標記的 facts(成格的格局、大限／流年四化引動、有標記的流月、化忌落點、祿忌疊宮),
 * 排除已在免費段寫完的;依權重高→低、同權重依原順序,每組一條,最多 4 條。
 */
export function selectHooks(deep: ZiweiDeepFacts, exclude: readonly string[] = []): HookItem[] {
  const ranked = deep.facts
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.hook && !exclude.includes(f.id))
    .sort((a, b) => b.f.weight - a.f.weight || a.i - b.i);
  const seen = new Set<string>();
  const out: HookItem[] = [];
  for (const { f } of ranked) {
    const g = hookGroup(f);
    if (seen.has(g)) continue;
    seen.add(g);
    out.push({ key: `H${out.length + 1}`, factId: f.id, fact: f.text });
    if (out.length === 4) break;
  }
  return out;
}

const byCat = (deep: ZiweiDeepFacts, ...cats: ZiweiFactCategory[]) =>
  deep.facts.filter((f) => cats.includes(f.category));
const pn = (n: string) => (n.endsWith('宮') ? n : `${n}宮`);

/** 「付費可得知的內容」:依這張盤的實際計算結果組字,每項附對得到的 fact id;不是固定文案。 */
export function paidList(deep: ZiweiDeepFacts): PaidItem[] {
  const out: PaidItem[] = [];
  const patterns = byCat(deep, 'pattern');
  if (patterns.length) {
    out.push({
      text: `這張盤成了 ${patterns.length} 個格局（${patterns.map((p) => p.id.slice('pattern:'.length)).join('、')}），逐一說明成格的條件與影響`,
      factIds: patterns.map((p) => p.id),
    });
  }
  const sur = byCat(deep, 'surround');
  const jia = byCat(deep, 'jia');
  const fav = sur.filter((f) => f.tone === 'favorable').length;
  const cau = sur.filter((f) => f.tone === 'caution').length;
  out.push({
    text: `十二宮逐宮的三方四正會照（${fav} 宮吉星較多、${cau} 宮煞星較多）${jia.length ? `，以及 ${jia.length} 組相夾` : ''}、四組三合與六組暗合`,
    factIds: [...sur, ...jia, ...byCat(deep, 'sanhe', 'liuhe')].map((f) => f.id),
  });
  const dec = deep.facts.find((f) => f.id === 'decadal:命宮');
  const decJi = deep.facts.find((f) => f.id === 'decadal:化忌');
  const timeline = byCat(deep, 'decadal_timeline');
  if (dec && decJi && !dec.detail.childhood) {
    out.push({
      text: `目前 ${dec.detail.ageRange} 歲的大限：大限命宮在本命${pn(dec.palaces[0])}，大限化忌落${pn(decJi.palaces[0])}；以及一生 ${timeline.length} 個大限各自的起訖年份`,
      factIds: [dec.id, decJi.id, ...timeline.map((f) => f.id)],
    });
  }
  const ym = byCat(deep, 'yearly_mutagen');
  if (ym.length) {
    out.push({
      text: `農曆 ${deep.lunarYear} 年流年四化引動的本命宮：${ym.map((f) => `化${f.detail.mutagen}入${pn(f.palaces[0])}`).join('、')}，以及流年十二宮疊在本命哪一宮`,
      factIds: [...ym, ...byCat(deep, 'yearly', 'yearly_overlay')].map((f) => f.id),
    });
  }
  const stack = byCat(deep, 'mutagen_stack');
  if (stack.length) {
    out.push({
      text: `今年疊宮：${stack.map((f) => `${pn(f.palaces[0])}${f.detail.kind}`).join('、')}`,
      factIds: stack.map((f) => f.id),
    });
  }
  const months = byCat(deep, 'monthly');
  const marked = months.filter((f) => f.tone !== 'neutral');
  if (months.length) {
    const n = (t: string) => marked.filter((f) => f.tone === t).length;
    out.push({
      text: `農曆 ${deep.lunarYear} 年 ${months.length} 段流月逐月的重心，其中 ${marked.length} 段有標記（有利 ${n('favorable')}、留意 ${n('caution')}、吉凶並見 ${n('mixed')}）`,
      factIds: months.map((f) => f.id),
    });
  }
  return out;
}

/** 深度報告各章:每章只拿自己的 facts(SPEC:分章產生,AI 不得自行補算)。沒有 fact 的章不產生。 */
export function chapters(deep: ZiweiDeepFacts): ReadingChapter[] {
  const spec: [string, string, ZiweiFactCategory[]][] = [
    ['patterns', '格局', ['pattern']],
    ['palaces', '十二宮的互動：三方四正、三合、暗合與相夾', ['surround', 'sanhe', 'liuhe', 'jia']],
    ['decadal', '大限與人生時間點', ['decadal', 'decadal_mutagen', 'decadal_timeline', 'mutagen_stack']],
    ['yearly', `農曆 ${deep.lunarYear} 年流年`, ['yearly', 'yearly_overlay', 'yearly_mutagen', 'mutagen_stack']],
    ['monthly', `農曆 ${deep.lunarYear} 年十二流月`, ['monthly']],
  ];
  return spec
    .map(([id, title, cats]) => ({ id, title, facts: byCat(deep, ...cats).map(toFact) }))
    .filter((c) => c.facts.length > 0);
}

/**
 * 紫微兩段式解讀計畫。birth 不含 locale;盤一律 zh-TW 排(Z1 與 analyze 的前提)。
 * today = 目標國曆日期 'YYYY-M-D'(訪客當地今天,由呼叫端給,本函式不讀時鐘)。
 */
export function planZiweiReading(birth: Omit<ChartRequest, 'locale'>, today: string): ReadingPlan {
  const result = computeChart({ ...birth, locale: 'zh-TW' });
  const astro = result.astrolabe;
  const analysis = analyzeZiwei(astro);
  const horoscope = computeHoroscope(astro, today);
  const base = toContext(result, 'zh-TW', horoscope, analysis);
  const deep = computeZiweiDeepFacts(astro, today);

  const month = currentMonthFact(astro, deep);
  const bonus = pickBonus(deep, month);
  const hooks = selectHooks(deep, bonus?.facts.map((f) => f.id) ?? []);
  const yearly = deep.facts.filter((f) => f.id === 'yearly:命宮' || f.category === 'yearly_mutagen');
  const hookFacts = hooks.map((h) => deep.facts.find((f) => f.id === h.factId)!);
  // 簡批 facts:既有簡批 facts + 今年流年(第六段「今年運勢」的依據)+ 免費段 + 鉤子對應的 fact;id 去重保序
  const briefFacts: Fact[] = [];
  const seen = new Set<string>();
  const add = (f: Fact) => {
    if (seen.has(f.id)) return;
    seen.add(f.id);
    briefFacts.push(f);
  };
  // 既有 facts 的英文標籤 soul/body 是「命主/身主星」,模型曾誤讀成「身宮」(Z2 實跑);給模型看中文名
  base.facts.forEach((f) => add({ id: BRIEF_LABELS[f.label] ?? f.label, value: f.value }));
  [...yearly, ...(bonus?.facts ?? []), ...hookFacts].forEach((f) => add(toFact(f)));

  return {
    systemId: 'ziwei',
    locale: 'zh-TW',
    headline: base.headline,
    sections: [...SECTIONS],
    briefFacts,
    bonus: bonus ? { heading: bonus.heading, factIds: bonus.facts.map((f) => f.id) } : null,
    hooks,
    paidList: paidList(deep),
    chapters: chapters(deep),
  };
}

const MAJORS = Object.keys(STAR_PROFILES);
const MUTAGEN_STARS = [...MAJORS, '文昌', '文曲', '左輔', '右弼'];

/**
 * 紫微的事實核對詞表:十四主星、六吉六煞、祿存天馬、格局名;「星化X」整串必須出現在 facts。
 * 刻意不收雜曜與流耀(天才、天空、天德…會撞到一般用語,誤判太多;見 Z2 RISKS)。
 */
export const ZIWEI_VOCAB: Vocabulary = {
  // 格局名連同去掉「格」字的寫法(模型常寫「殺破狼」「火貪」)
  terms: [...MAJORS, ...SIX_LUCKY, ...SIX_UNLUCKY, '祿存', '天馬', ...PATTERN_NAMES, ...PATTERN_NAMES.filter((n) => n.endsWith('格')).map((n) => n.slice(0, -1))],
  mask: ['紫微斗數', '天機不可洩漏', '天機不可泄漏', '天馬行空'],
  patterns: [new RegExp(`(?:${MUTAGEN_STARS.join('|')})化[祿權科忌]`, 'g')],
  normalizeCorpus: (s) => s.replace(/[（(][廟旺得利平不陷][）)]/g, ''),
};
