/**
 * 八字喜用神 / 格局分析(扶抑取用法)。
 *
 * 方法宣告(命理派別繁多,本模組明確採「扶抑法」基準,最常用、可解釋):
 *   1. 以日主五行為基準,把四柱八字依「十神」歸為「扶」(印+比劫,生扶日主)
 *      與「抑」(食傷+財+官殺,洩耗剋日主)兩勢,月令(月支)權重加倍(司令最重)。
 *   2. 扶 > 抑 → 身強;抑 > 扶 → 身弱;相近 → 中和。
 *   3. 身強 → 喜「抑」之五行(食傷/財/官殺);身弱 → 喜「扶」之五行(印/比劫)。
 *   ⚠️ 不含調候/通關/病藥等進階取法;邊界命局可能與其他派別判定不同。AI 解讀層
 *      應將本結果呈現為「扶抑法初步判定」,非唯一定論。
 *
 * 十神由 lunar-javascript 算出(本模組只分類,不自行推十神),故與排盤同源。
 */
export type WuXing = '木' | '火' | '土' | '金' | '水';
export type Strength = '身強' | '身弱' | '中和';

const GAN_WUXING: Record<string, WuXing> = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土',
  己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
};

/** 五行相生:X 生 SHENG[X]。 */
const SHENG: Record<WuXing, WuXing> = {
  木: '火', 火: '土', 土: '金', 金: '水', 水: '木',
};
/** 五行相剋:X 剋 KE[X]。 */
const KE: Record<WuXing, WuXing> = {
  木: '土', 火: '金', 土: '水', 金: '木', 水: '火',
};
/** 反查:回傳 map[?] === target 的 key(生我=印用 SHENG 反查、剋我=官殺用 KE 反查)。 */
function inverse(map: Record<WuXing, WuXing>, target: WuXing): WuXing {
  return (Object.keys(map) as WuXing[]).find((k) => map[k] === target) as WuXing;
}

// 十神 → 勢力歸類。含簡繁兩形(lunar 原始輸出為簡體,排盤後可能已正規化為繁中)。
const FU = new Set(['比肩', '劫財', '劫财', '正印', '偏印']); // 印 + 比劫:生扶日主
const YI = new Set([
  '食神', '傷官', '伤官', '正財', '正财', '偏財', '偏财', '正官', '七殺', '七杀',
]); // 食傷 + 財 + 官殺:洩耗剋日主
function group(shiShen: string): '扶' | '抑' | null {
  if (FU.has(shiShen)) return '扶';
  if (YI.has(shiShen)) return '抑';
  return null; // 日主本身等
}

export interface BaziAnalysisInput {
  dayGan: string;
  /** 年/月/時 天干十神(日干=日主,不傳)。 */
  stemShiShen: string[];
  /** 四柱地支「本氣」十神;月支 isMonth=true 會加倍計分。 */
  branchPrimaryShiShen: { shiShen: string; isMonth: boolean }[];
  /** 月令本氣十神(取格用,未正規化的原樣即可)。 */
  monthPrimaryShiShen: string;
}

export interface BaziAnalysis {
  dayElement: WuXing;
  strength: Strength;
  /** 喜用神(五行,繁簡共形) */
  favorable: WuXing[];
  /** 忌神(五行) */
  avoid: WuXing[];
  supportScore: number;
  drainScore: number;
  /** 月令本氣十神(原樣);computeBazi 負責組成「X格」並在地化 */
  patternShiShen: string;
}

function uniq(a: WuXing[]): WuXing[] {
  return [...new Set(a)];
}

export function analyzeBazi(input: BaziAnalysisInput): BaziAnalysis {
  const dayElement = GAN_WUXING[input.dayGan];

  let support = 0;
  let drain = 0;
  for (const s of input.stemShiShen) {
    const g = group(s);
    if (g === '扶') support += 1;
    else if (g === '抑') drain += 1;
  }
  for (const b of input.branchPrimaryShiShen) {
    const g = group(b.shiShen);
    const w = b.isMonth ? 2 : 1; // 月令司令,權重加倍
    if (g === '扶') support += w;
    else if (g === '抑') drain += w;
  }

  const diff = support - drain;
  const strength: Strength = diff >= 2 ? '身強' : diff <= -2 ? '身弱' : '中和';

  const yin = inverse(SHENG, dayElement); // 生我 = 印
  const bi = dayElement; // 同我 = 比劫
  const shiShang = SHENG[dayElement]; // 我生 = 食傷
  const cai = KE[dayElement]; // 我剋 = 財
  const guan = inverse(KE, dayElement); // 剋我 = 官殺

  let favorable: WuXing[];
  let avoid: WuXing[];
  if (strength === '身強') {
    favorable = uniq([shiShang, cai, guan]);
    avoid = uniq([yin, bi]);
  } else if (strength === '身弱') {
    favorable = uniq([yin, bi]);
    avoid = uniq([shiShang, cai, guan]);
  } else {
    // 中和:輕洩取流通,喜食傷/財;忌再添官殺剋身
    favorable = uniq([shiShang, cai]);
    avoid = uniq([guan]);
  }

  return {
    dayElement,
    strength,
    favorable,
    avoid,
    supportScore: support,
    drainScore: drain,
    patternShiShen: input.monthPrimaryShiShen,
  };
}
