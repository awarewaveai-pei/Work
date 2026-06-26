import { Solar } from 'lunar-javascript';
import { computeBazi, type BaziRequest } from './bazi';
import { defaultLocale, type Locale } from './i18n/config';
import type { InterpretationContext } from './divination/types';

/**
 * 每日運勢工廠(PLAN §9)— 免費病毒漏斗,確定性、零邊際成本。
 *
 * 幸運色/數/方位:由「真喜用神(扶抑法,身強弱決定;見 baziAnalysis)」查五行屬性表
 *   得出 → 純演算法、零 AI、同人同日固定。(舊版恆取「生我之印」,身強者其實忌印 → 已修)
 * 今日運勢評分:由「當日日柱五行 vs 日主五行」之生剋關係 + 確定性微擾 → 4 領域星等。
 * 宜忌:lunar-javascript 黃曆(getDayYi/getDayJi)。
 * 運勢「文案」由 AI 層另行產生(本模組給結構化結果 + dailyContext 餵 AI,供快取 chart+date+locale)。
 */

export type WuXing = '木' | '火' | '土' | '金' | '水';

interface WuXingAttr {
  colors: Record<Locale, string[]>;
  numbers: number[];
  direction: Record<Locale, string>;
}

const WUXING: Record<WuXing, WuXingAttr> = {
  木: { colors: { 'zh-TW': ['綠', '青'], en: ['Green', 'Teal'] }, numbers: [3, 8], direction: { 'zh-TW': '東', en: 'East' } },
  火: { colors: { 'zh-TW': ['紅', '紫'], en: ['Red', 'Purple'] }, numbers: [2, 7], direction: { 'zh-TW': '南', en: 'South' } },
  土: { colors: { 'zh-TW': ['黃', '棕'], en: ['Yellow', 'Brown'] }, numbers: [5, 10], direction: { 'zh-TW': '中央', en: 'Center' } },
  金: { colors: { 'zh-TW': ['白', '金'], en: ['White', 'Gold'] }, numbers: [4, 9], direction: { 'zh-TW': '西', en: 'West' } },
  水: { colors: { 'zh-TW': ['黑', '藍'], en: ['Black', 'Blue'] }, numbers: [1, 6], direction: { 'zh-TW': '北', en: 'North' } },
};

const GAN_WUXING: Record<string, WuXing> = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土',
  己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
};

/** 我生(相生):木→火→土→金→水→木 */
const GENERATES: Record<WuXing, WuXing> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
/** 我剋(相剋):木→土→水→火→金→木 */
const CONTROLS: Record<WuXing, WuXing> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

type Relation = '比和' | '生我' | '我生' | '剋我' | '我剋';
function relation(today: WuXing, me: WuXing): Relation {
  if (today === me) return '比和';
  if (GENERATES[today] === me) return '生我';
  if (GENERATES[me] === today) return '我生';
  if (CONTROLS[today] === me) return '剋我';
  return '我剋';
}
const REL_SCORE: Record<Relation, number> = { 比和: 5, 生我: 4, 我生: 3, 我剋: 3, 剋我: 2 };

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export interface DailyFortune {
  date: string;
  /** 主喜用神五行(扶抑法 favorable 之首,決定幸運色/數/方位) */
  luckyElement: WuXing;
  luckyColors: string[];
  luckyNumbers: number[];
  luckyDirection: string;
  scores: { overall: number; love: number; career: number; wealth: number; health: number };
  yi: string[];
  ji: string[];
  /** 命局摘要(供 AI 文案綁具體) */
  dayMaster: string;
  strength: string;
  pattern: string;
  favorable: string[];
}

export function computeDailyFortune(
  birth: BaziRequest,
  target: { year: number; month: number; day: number },
  locale: Locale = defaultLocale,
): DailyFortune {
  const bazi = computeBazi({ ...birth, locale });
  const meEl = GAN_WUXING[bazi.dayMaster];
  // 真喜用神(扶抑法):身強者忌印、身弱者喜印;取 favorable 之首為主喜神。
  const luckyEl = (bazi.analysis.favorable[0] ?? meEl) as WuXing;
  const attr = WUXING[luckyEl];

  const lunar = Solar.fromYmd(target.year, target.month, target.day).getLunar();
  const todayEl = GAN_WUXING[lunar.getDayGan()];
  const ganZhi = lunar.getDayInGanZhi();
  const overall = REL_SCORE[relation(todayEl, meEl)];

  const domainScore = (domain: string) => {
    const offset = (hash(`${bazi.dayMaster}|${ganZhi}|${domain}`) % 3) - 1; // -1,0,+1
    return clamp(overall + offset, 1, 5);
  };

  const date = `${target.year}-${String(target.month).padStart(2, '0')}-${String(target.day).padStart(2, '0')}`;

  return {
    date,
    luckyElement: luckyEl,
    luckyColors: attr.colors[locale],
    luckyNumbers: attr.numbers,
    luckyDirection: attr.direction[locale],
    scores: {
      overall,
      love: domainScore('love'),
      career: domainScore('career'),
      wealth: domainScore('wealth'),
      health: domainScore('health'),
    },
    yi: lunar.getDayYi().slice(0, 5),
    ji: lunar.getDayJi().slice(0, 5),
    dayMaster: bazi.dayMaster,
    strength: bazi.analysis.strength,
    pattern: bazi.analysis.pattern,
    favorable: bazi.analysis.favorable,
  };
}

/**
 * 每日運勢 → AI 解讀 context(供 AiReading 產生個人化文案)。
 * systemId 用 'bazi'(本運勢由八字推),facts 明確標今日 + 評分 + 宜忌 → AI 寫每日運勢。
 */
export function dailyContext(f: DailyFortune, locale: Locale): InterpretationContext {
  return {
    systemId: 'bazi',
    locale,
    headline: `今日運勢 ${f.date}`,
    facts: [
      { label: 'readingType', value: '每日運勢(今日)' },
      { label: 'date', value: f.date },
      { label: 'dayMaster', value: f.dayMaster },
      { label: 'strength', value: f.strength },
      { label: 'pattern', value: f.pattern },
      { label: 'favorable', value: f.favorable.join('、') || '—' },
      { label: 'luckyElement', value: f.luckyElement },
      { label: 'luckyColors', value: f.luckyColors.join('、') },
      { label: 'luckyNumbers', value: f.luckyNumbers.join('、') },
      { label: 'luckyDirection', value: f.luckyDirection },
      { label: 'scoreOverall', value: `${f.scores.overall}/5` },
      { label: 'scoreLove', value: `${f.scores.love}/5` },
      { label: 'scoreCareer', value: `${f.scores.career}/5` },
      { label: 'scoreWealth', value: `${f.scores.wealth}/5` },
      { label: 'scoreHealth', value: `${f.scores.health}/5` },
      { label: 'yi', value: f.yi.join('、') || '—' },
      { label: 'ji', value: f.ji.join('、') || '—' },
    ],
  };
}

/** 快取鍵(PLAN §9):同人同日同語言只生一次。 */
export function dailyCacheKey(chartId: string, date: string, locale: Locale): string {
  return `${chartId}|${date}|${locale}`;
}
