import { Solar } from 'lunar-javascript';
import { computeBazi, type BaziRequest, type BaziResult } from './bazi';
import { defaultLocale, type Locale } from './i18n/config';
import type { InterpretationContext } from './divination/types';
import { KE, SHENG, stemWuXing, type WuXing } from './ganzhi';
import { localize, toTraditional } from './s2t';
import { animalName, zhiXingName } from './divination/systems/zeri';

/**
 * 每日運勢工廠(PLAN §9)— 免費病毒漏斗,確定性、零邊際成本。
 *
 * 幸運色/數/方位:由「真喜用神(扶抑法,身強弱決定;見 baziAnalysis)」查五行屬性表
 *   得出 → 純演算法、零 AI、同人同日固定。(舊版恆取「生我之印」,身強者其實忌印 → 已修)
 * 今日運勢評分:由「當日日柱五行 vs 日主五行」之生剋關係 + 確定性微擾 → 4 領域星等。
 * 宜忌與當日黃曆:lunar-javascript(computeDailyAlmanac,與出生資料無關)。
 * 運勢「文案」由 AI 層另行產生(本模組給結構化結果 + dailyContext 餵 AI,供快取 chart+date+locale)。
 */

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

type Relation = '比和' | '生我' | '我生' | '剋我' | '我剋';
function relation(today: WuXing, me: WuXing): Relation {
  if (today === me) return '比和';
  if (SHENG[today] === me) return '生我';
  if (SHENG[me] === today) return '我生';
  if (KE[today] === me) return '剋我';
  return '我剋';
}
const REL_SCORE: Record<Relation, number> = { 比和: 5, 生我: 4, 我生: 3, 我剋: 3, 剋我: 2 };

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * lunar-javascript 與通行寫法不同的字,顯示前改正(全站只在這裡改)。
 * 依據:二十八宿通行名「胃土雉」「壁水貐」;彭祖百忌通行「壬不汲水更難提防」。
 * 比對對象是該庫的簡體原文,改正後再轉繁。
 */
export const ALMANAC_FIXES: ReadonlyArray<readonly [string, string]> = [
  ['胃土彘', '胃土雉'],
  ['壁水獝', '壁水貐'],
  ['壬不泱水', '壬不汲水'],
];
function fix(raw: string): string {
  return ALMANAC_FIXES.reduce((acc, [from, to]) => acc.split(from).join(to), raw);
}

const WUXING_EN: Record<string, string> = { 木: 'Wood', 火: 'Fire', 土: 'Earth', 金: 'Metal', 水: 'Water' };
const NINE_NUMBER_EN: Record<string, string> = {
  一: 'One', 二: 'Two', 三: 'Three', 四: 'Four', 五: 'Five', 六: 'Six', 七: 'Seven', 八: 'Eight', 九: 'Nine',
};
const NINE_COLOR_EN: Record<string, string> = {
  白: 'White', 黑: 'Black', 碧: 'Jade', 綠: 'Green', 黃: 'Yellow', 赤: 'Red', 紫: 'Purple',
};
/** 二十八宿英文名(天文通行譯名),鍵為繁體宿名。 */
const MANSION_EN: Record<string, string> = {
  角: 'Horn', 亢: 'Neck', 氐: 'Root', 房: 'Room', 心: 'Heart', 尾: 'Tail', 箕: 'Winnowing Basket',
  斗: 'Dipper', 牛: 'Ox', 女: 'Girl', 虛: 'Emptiness', 危: 'Rooftop', 室: 'Encampment', 壁: 'Wall',
  奎: 'Legs', 婁: 'Bond', 胃: 'Stomach', 昴: 'Hairy Head', 畢: 'Net', 觜: 'Turtle Beak', 參: 'Three Stars',
  井: 'Well', 鬼: 'Ghost', 柳: 'Willow', 星: 'Star', 張: 'Extended Net', 翼: 'Wings', 軫: 'Chariot',
};
/** 方位描述(繁體)→ 英文。 */
const DIRECTION_EN: Record<string, string> = {
  正東: 'East', 東南: 'Southeast', 正南: 'South', 西南: 'Southwest', 正西: 'West', 西北: 'Northwest',
  正北: 'North', 東北: 'Northeast', 東: 'East', 南: 'South', 西: 'West', 北: 'North',
};

/** 當日黃曆。只看日期,同一天對所有人相同。 */
export interface DailyAlmanac {
  /** 日九星,如「四綠木」/ Four Green (Wood) */
  nineStar: string;
  /** 二十八宿值日:名(如「軫水蚓」/ Chariot (軫))+ 吉凶 */
  mansion: { name: string; auspicious: boolean };
  /** 建除十二值 */
  officer: string;
  /** 沖煞:沖的生肖、沖的干支、煞方 */
  clash: { animal: string; ganZhi: string; sha: string };
  /** 喜神 / 財神 / 福神方位 */
  gods: { joy: string; wealth: string; fortune: string };
  /** 胎神占方(無通行英譯,一律中文) */
  fetusGod: string;
  /** 彭祖百忌兩句(一律中文) */
  pengZu: [string, string];
  /** 日吉神 / 日凶煞(一律中文;無則空陣列) */
  luckyGods: string[];
  unluckyGods: string[];
  /** 宜忌全部(一律中文) */
  yi: string[];
  ji: string[];
}

export function computeDailyAlmanac(
  target: { year: number; month: number; day: number },
  locale: Locale = defaultLocale,
): DailyAlmanac {
  const lunar = Solar.fromYmd(target.year, target.month, target.day).getLunar();
  const zh = (raw: string) => localize(fix(raw), locale);
  // 英文介面查表要用繁體鍵;術語本身無英譯者仍顯示繁中。
  const tw = (raw: string) => toTraditional(fix(raw));
  const en = locale === 'en';
  const dir = (raw: string) => (en ? DIRECTION_EN[tw(raw)] ?? tw(raw) : zh(raw));
  // 無英譯的術語:中文介面依語言、英文介面一律繁中。
  const show = (raw: string) => (en ? tw(raw) : zh(raw));
  const list = (raw: string[]) => raw.filter((x) => x !== '无').map(show);

  const star = lunar.getDayNineStar();
  const starColor = tw(star.getColor());
  const nineStar = en
    ? `${NINE_NUMBER_EN[star.getNumber()]} ${NINE_COLOR_EN[starColor]} (${WUXING_EN[star.getWuXing()]})`
    : zh(star.getNumber() + star.getColor() + star.getWuXing());

  const xiu = tw(lunar.getXiu());
  const mansionZh = zh(lunar.getXiu() + lunar.getZheng() + lunar.getAnimal());

  const chongZhi = lunar.getDayChong();
  return {
    nineStar,
    mansion: { name: en ? `${MANSION_EN[xiu]} (${xiu})` : mansionZh, auspicious: lunar.getXiuLuck() === '吉' },
    officer: zhiXingName(tw(lunar.getZhiXing()), locale),
    clash: {
      animal: animalName(chongZhi, zh(lunar.getDayChongShengXiao()), locale),
      ganZhi: lunar.getDayChongGan() + chongZhi,
      sha: dir(lunar.getDaySha()),
    },
    gods: {
      joy: dir(lunar.getDayPositionXiDesc()),
      wealth: dir(lunar.getDayPositionCaiDesc()),
      fortune: dir(lunar.getDayPositionFuDesc()),
    },
    fetusGod: show(lunar.getDayPositionTai()),
    pengZu: [show(lunar.getPengZuGan()), show(lunar.getPengZuZhi())],
    luckyGods: list(lunar.getDayJiShen()),
    unluckyGods: list(lunar.getDayXiongSha()),
    yi: list(lunar.getDayYi()),
    ji: list(lunar.getDayJi()),
  };
}

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
  /** 當日黃曆(與出生資料無關) */
  almanac: DailyAlmanac;
  /** 出生地時區與出生當下的 UTC 偏移、夏令時間(取自八字,結果頁顯示) */
  zone: BaziResult['zone'];
}

export function computeDailyFortune(
  birth: BaziRequest,
  target: { year: number; month: number; day: number },
  locale: Locale = defaultLocale,
): DailyFortune {
  const bazi = computeBazi({ ...birth, locale });
  const meEl = stemWuXing(bazi.dayMaster);
  // 真喜用神(扶抑法):身強者忌印、身弱者喜印;取 favorable 之首為主喜神。
  //   analyzeBazi 保證 favorable 非空(各 strength 分支皆 uniq ≥1);不設靜默 fallback,
  //   以免日後若 favorable 變空而靜默回日主五行(身強者得比劫=命理錯,critic 2026-06-26)。
  const luckyEl = bazi.analysis.favorable[0] as WuXing;
  const attr = WUXING[luckyEl];

  const lunar = Solar.fromYmd(target.year, target.month, target.day).getLunar();
  const todayEl = stemWuXing(lunar.getDayGan());
  const ganZhi = lunar.getDayInGanZhi();
  const overall = REL_SCORE[relation(todayEl, meEl)];

  const domainScore = (domain: string) => {
    const offset = (hash(`${bazi.dayMaster}|${ganZhi}|${domain}`) % 3) - 1; // -1,0,+1
    return clamp(overall + offset, 1, 5);
  };

  const almanac = computeDailyAlmanac(target, locale);
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
    yi: almanac.yi.slice(0, 5),
    ji: almanac.ji.slice(0, 5),
    zone: bazi.zone,
    dayMaster: bazi.dayMaster,
    strength: bazi.analysis.strength,
    pattern: bazi.analysis.pattern,
    favorable: bazi.analysis.favorable,
    almanac,
  };
}

/**
 * 每日運勢 → AI 解讀 context(供 AiReading 產生個人化文案)。
 * systemId 用 'bazi'(本運勢由八字推),facts 明確標今日 + 評分 + 宜忌 → AI 寫每日運勢。
 */
export function dailyContext(f: DailyFortune, locale: Locale): InterpretationContext {
  return {
    systemId: 'daily',
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
      ...almanacFacts(f.almanac),
    ],
  };
}

/** 當日黃曆重點 → 7 條 facts(value 皆遠低於 300 字)。 */
function almanacFacts(a: DailyAlmanac): { label: string; value: string }[] {
  const cut = (s: string) => s.slice(0, 300);
  return [
    { label: 'almanacOfficer', value: a.officer },
    { label: 'almanacMansion', value: `${a.mansion.name} ${a.mansion.auspicious ? '吉' : '凶'}` },
    { label: 'almanacNineStar', value: a.nineStar },
    { label: 'almanacClash', value: `${a.clash.animal}(${a.clash.ganZhi})/ ${a.clash.sha}` },
    { label: 'almanacGods', value: `喜神 ${a.gods.joy}、財神 ${a.gods.wealth}、福神 ${a.gods.fortune}` },
    { label: 'almanacPengZu', value: a.pengZu.join(';') },
    { label: 'almanacSpirits', value: cut(`吉神:${a.luckyGods.join('、') || '—'};凶煞:${a.unluckyGods.join('、') || '—'}`) },
  ];
}

/** 快取鍵(PLAN §9):同人同日同語言只生一次。 */
export function dailyCacheKey(chartId: string, date: string, locale: Locale): string {
  return `${chartId}|${date}|${locale}`;
}
