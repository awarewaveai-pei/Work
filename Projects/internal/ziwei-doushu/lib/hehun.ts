import { liChunYear, yearGanZhi } from './liChun';
import type { BaziAnalysisDisplay, BaziPillar } from './bazi';
import {
  branchIndex,
  branchWuXing,
  ganHe,
  isHai,
  isLiuChong,
  isLiuHe,
  isSanHePair,
  isXing,
  KE,
  SHENG,
  stemIndex,
  stemWuXing,
  type WuXing,
} from './ganzhi';

/**
 * 合婚(八字合婚＋生肖配對)— 純函式,依傳統公開規則逐項比對兩人命盤。
 *
 * 只輸出「每項合/平/沖＋依據」與彙總件數,不給 0–100 總分(宣判式分數無依據可言)。
 * 干支一律取自 computeBazi 的四柱(年柱以立春換年,與 lib/bazi.ts 同源);
 *   ⚠️ 不用 BaziResult.zodiac:那是農曆正月初一換年,立春到春節之間會與年柱不一致。
 */

export type Verdict = '合' | '平' | '沖';

export type HehunKey =
  | 'yearBranch'
  | 'dayStem'
  | 'dayBranch'
  | 'elementsAB'
  | 'elementsBA'
  | 'yearNaYin';

/** 依據裡的關係代碼(畫面文字在 messages 的 hehun.rel,AI facts 用 RELATION_ZH)。 */
export type Relation =
  | 'liuHe' // 地支六合
  | 'sanHe' // 地支三合
  | 'liuChong' // 地支六沖
  | 'hai' // 地支相害
  | 'xing' // 地支相刑(含自刑)
  | 'wuHe' // 天干五合
  | 'aShengB' // 甲方五行生乙方
  | 'bShengA'
  | 'aKeB' // 甲方五行剋乙方
  | 'bKeA'
  | 'biHe' // 五行相同
  | 'feeds' // 對方日主/旺行正是本方喜用
  | 'strains'; // 對方日主正是本方忌神

export interface HehunItem {
  key: HehunKey;
  verdict: Verdict;
  basis: {
    /** 甲方(elementsBA 時為被補的一方)用來比對的干支/五行 */
    a: string;
    b: string;
    /** 空陣列 = 無特別關係 */
    relations: Relation[];
  };
}

export interface HehunMatch {
  items: HehunItem[];
  summary: Record<Verdict, number>;
}

export const RELATION_ZH: Record<Relation, string> = {
  liuHe: '六合',
  sanHe: '三合',
  liuChong: '六沖',
  hai: '相害',
  xing: '相刑',
  wuHe: '五合',
  aShengB: '甲方生乙方',
  bShengA: '乙方生甲方',
  aKeB: '甲方剋乙方',
  bKeA: '乙方剋甲方',
  biHe: '比和',
  feeds: '得對方補益',
  strains: '對方為忌神',
};

/** 生肖,依地支序(子=鼠)。 */
const ANIMALS = '鼠牛虎兔龍蛇馬羊猴雞狗豬';

/** 地支 → 生肖(繁中)。 */
export function animalOf(zhi: string): string {
  return ANIMALS[branchIndex(zhi)];
}

/**
 * 出生日 → 年支(生肖以立春換年)。只給日期時立春當日即算新年(lib/liChun.ts);
 * 立春當天、交節時刻前出生者可能差一年,需改用完整八字模式。
 */
export function yearBranchOf(year: number, month: number, day: number): string {
  return yearGanZhi(liChunYear(year, month, day))[1];
}

/** 兩地支間的所有傳統關係(可同時多項,如巳申 = 六合＋相刑);規則表在 lib/ganzhi.ts。 */
export function branchRelations(zhiA: string, zhiB: string): Relation[] {
  branchIndex(zhiA); // 未知地支拋錯
  branchIndex(zhiB);
  const out: Relation[] = [];
  if (isLiuHe(zhiA, zhiB)) out.push('liuHe');
  if (isSanHePair(zhiA, zhiB)) out.push('sanHe');
  if (isLiuChong(zhiA, zhiB)) out.push('liuChong');
  if (isHai(zhiA, zhiB)) out.push('hai');
  if (isXing(zhiA, zhiB)) out.push('xing');
  return out;
}

const HARMONY: ReadonlySet<Relation> = new Set(['liuHe', 'sanHe', 'wuHe', 'aShengB', 'bShengA', 'feeds']);
const TENSION: ReadonlySet<Relation> = new Set(['liuChong', 'hai', 'xing', 'aKeB', 'bKeA', 'strains']);

/** 只有和諧關係 → 合;只有緊張關係 → 沖;兩者皆有或皆無 → 平。 */
function verdictOf(relations: Relation[]): Verdict {
  const harmony = relations.some((r) => HARMONY.has(r));
  const tension = relations.some((r) => TENSION.has(r));
  if (harmony && !tension) return '合';
  if (tension && !harmony) return '沖';
  return '平';
}

function item(key: HehunKey, a: string, b: string, relations: Relation[]): HehunItem {
  return { key, verdict: verdictOf(relations), basis: { a, b, relations } };
}

function summarize(items: HehunItem[]): Record<Verdict, number> {
  const s: Record<Verdict, number> = { 合: 0, 平: 0, 沖: 0 };
  for (const i of items) s[i.verdict] += 1;
  return s;
}

/** 生肖配對(年支),完整模式與只用出生年模式共用。 */
export function yearBranchItem(zhiA: string, zhiB: string): HehunItem {
  return item('yearBranch', zhiA, zhiB, branchRelations(zhiA, zhiB));
}

function elementRelation(a: WuXing, b: WuXing): Relation {
  if (a === b) return 'biHe';
  if (SHENG[a] === b) return 'aShengB';
  if (SHENG[b] === a) return 'bShengA';
  return KE[a] === b ? 'aKeB' : 'bKeA';
}

/** 合婚只讀這些欄位;`BaziResult` 結構相容,可直接傳入。 */
export interface HehunChart {
  pillars: Record<'year' | 'month' | 'day' | 'hour', Pick<BaziPillar, 'gan' | 'zhi' | 'naYin'>>;
  analysis: Pick<BaziAnalysisDisplay, 'dayElement' | 'favorable' | 'avoid'>;
}

/** 四柱八字(4 干＋4 支本氣)五行計數,取最多者(並列全取)。 */
export function dominantElements(r: HehunChart): WuXing[] {
  const count: Record<WuXing, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  for (const p of [r.pillars.year, r.pillars.month, r.pillars.day, r.pillars.hour]) {
    count[stemWuXing(p.gan)] += 1;
    count[branchWuXing(p.zhi)] += 1;
  }
  const max = Math.max(...Object.values(count));
  return (Object.keys(count) as WuXing[]).filter((k) => count[k] === max);
}

/** self 的喜用是否由 other 的日主或旺行補上;other 日主落在 self 忌神 → strains。 */
function complementItem(key: HehunKey, self: HehunChart, other: HehunChart): HehunItem {
  const otherDay = other.analysis.dayElement;
  const otherSupply = new Set<WuXing>([otherDay, ...dominantElements(other)]);
  const relations: Relation[] = [];
  if (self.analysis.favorable.some((e) => otherSupply.has(e))) relations.push('feeds');
  if (self.analysis.avoid.includes(otherDay)) relations.push('strains');
  return item(
    key,
    self.analysis.favorable.join(''),
    [...otherSupply].join(''),
    relations,
  );
}

/** 納音五行 = 納音名末字(海中金 → 金);繁簡同形。 */
function naYinElement(naYin: string): WuXing {
  const e = naYin.slice(-1) as WuXing;
  if (!(e in SHENG)) throw new Error(`未知納音: ${naYin}`);
  return e;
}

/** 完整八字合婚:a = 甲方、b = 乙方(兩次 computeBazi 的結果)。 */
export function matchBazi(a: HehunChart, b: HehunChart): HehunMatch {
  const pa = a.pillars;
  const pb = b.pillars;
  stemIndex(pa.day.gan); // 未知天干拋錯
  stemIndex(pb.day.gan);
  const naA = naYinElement(pa.year.naYin);
  const naB = naYinElement(pb.year.naYin);
  const dayBranchRel = branchRelations(pa.day.zhi, pb.day.zhi).filter(
    (r) => r === 'liuHe' || r === 'liuChong',
  );

  const items: HehunItem[] = [
    yearBranchItem(pa.year.zhi, pb.year.zhi),
    item('dayStem', pa.day.gan, pb.day.gan, ganHe(pa.day.gan, pb.day.gan) ? ['wuHe'] : []),
    item('dayBranch', pa.day.zhi, pb.day.zhi, dayBranchRel),
    complementItem('elementsAB', a, b),
    complementItem('elementsBA', b, a),
    item('yearNaYin', naA, naB, [elementRelation(naA, naB)]),
  ];
  return { items, summary: summarize(items) };
}

/** 只用出生年(生肖配對):僅年支一項。 */
export function matchZodiac(zhiA: string, zhiB: string): HehunMatch {
  const items = [yearBranchItem(zhiA, zhiB)];
  return { items, summary: summarize(items) };
}
