/**
 * 干支與五行的規則表 —— 全站唯一來源。八字、每日運勢、合婚、立春年柱都從這裡取。
 *
 * 口徑:傳統公開規則(《三命通會》干支關係;表同 bazi-skill references/wuxing-tables.md,MIT)。
 * 字一律為繁簡同形的干支單字。
 */

export const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const;
export const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;
export type Stem = (typeof STEMS)[number];
export type Branch = (typeof BRANCHES)[number];

export type WuXing = '木' | '火' | '土' | '金' | '水';

export const STEM_WUXING: Readonly<Record<Stem, WuXing>> = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土',
  己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
};
/** 地支本氣五行 */
export const BRANCH_WUXING: Readonly<Record<Branch, WuXing>> = {
  子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火',
  午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水',
};

/** 五行相生:X 生 SHENG[X]。 */
export const SHENG: Readonly<Record<WuXing, WuXing>> = {
  木: '火', 火: '土', 土: '金', 金: '水', 水: '木',
};
/** 五行相剋:X 剋 KE[X]。 */
export const KE: Readonly<Record<WuXing, WuXing>> = {
  木: '土', 火: '金', 土: '水', 金: '木', 水: '火',
};

export function isStem(s: string): s is Stem {
  return (STEMS as readonly string[]).includes(s);
}

/** 天干序(甲=0);未知字拋錯。 */
export function stemIndex(gan: string): number {
  const i = (STEMS as readonly string[]).indexOf(gan);
  if (i < 0) throw new Error(`未知天干: ${gan}`);
  return i;
}
/** 地支序(子=0);未知字拋錯。 */
export function branchIndex(zhi: string): number {
  const i = (BRANCHES as readonly string[]).indexOf(zhi);
  if (i < 0) throw new Error(`未知地支: ${zhi}`);
  return i;
}

/** 天干五行;未知字拋錯。 */
export function stemWuXing(gan: string): WuXing {
  return STEM_WUXING[STEMS[stemIndex(gan)]];
}
/** 地支本氣五行;未知字拋錯。 */
export function branchWuXing(zhi: string): WuXing {
  return BRANCH_WUXING[BRANCHES[branchIndex(zhi)]];
}

/** 六十甲子第 i 個(0 = 甲子,可為負)。 */
export function ganZhiAt(i: number): string {
  const n = ((i % 60) + 60) % 60;
  return STEMS[n % 10] + BRANCHES[n % 12];
}

/** 六十甲子序 0..59(甲子 = 0);陰陽不配的干支拋錯。 */
export function ganZhiIndex(gz: string): number {
  const g = stemIndex(gz[0]);
  const z = branchIndex(gz[1]);
  if (g % 2 !== z % 2) throw new Error(`非法干支: ${gz}`);
  return (((6 * g - 5 * z) % 60) + 60) % 60;
}

// ---- 干支關係規則表(字序即傳統口訣字序) ----

/** 天干五合與所化五行 */
export const GAN_HE: ReadonlyArray<readonly [Stem, Stem, WuXing]> = [
  ['甲', '己', '土'], ['乙', '庚', '金'], ['丙', '辛', '水'], ['丁', '壬', '木'], ['戊', '癸', '火'],
];
export const LIU_HE: ReadonlyArray<readonly [Branch, Branch]> = [
  ['子', '丑'], ['寅', '亥'], ['卯', '戌'], ['辰', '酉'], ['巳', '申'], ['午', '未'],
];
export const LIU_CHONG: ReadonlyArray<readonly [Branch, Branch]> = [
  ['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥'],
];
export const HAI: ReadonlyArray<readonly [Branch, Branch]> = [
  ['子', '未'], ['丑', '午'], ['寅', '巳'], ['卯', '辰'], ['申', '亥'], ['酉', '戌'],
];
/** 三合局與所化五行 */
export const SAN_HE: ReadonlyArray<readonly [readonly Branch[], WuXing]> = [
  [['申', '子', '辰'], '水'], [['亥', '卯', '未'], '木'], [['寅', '午', '戌'], '火'], [['巳', '酉', '丑'], '金'],
];
/** 無恩之刑、持勢之刑(兩字以上即刑) */
export const SAN_XING: ReadonlyArray<readonly Branch[]> = [['寅', '巳', '申'], ['丑', '戌', '未']];
/** 無禮之刑 */
export const ZI_MAO_XING: readonly Branch[] = ['子', '卯'];
/** 自刑:同支重見 */
export const SELF_XING: readonly Branch[] = ['辰', '午', '酉', '亥'];

const isPair = (a: string, b: string, [x, y]: readonly [string, string]) =>
  (a === x && b === y) || (a === y && b === x);
/** a、b 皆在同一組內 */
const inGroup = (a: string, b: string, g: readonly string[]) => g.includes(a) && g.includes(b);

// ---- 兩兩判定 ----

/** 兩天干五合 → 所化五行;不合回 null。 */
export function ganHe(a: string, b: string): WuXing | null {
  const he = GAN_HE.find(([x, y]) => isPair(a, b, [x, y]));
  return he ? he[2] : null;
}
export const isLiuHe = (a: string, b: string) => LIU_HE.some((p) => isPair(a, b, p));
export const isLiuChong = (a: string, b: string) => LIU_CHONG.some((p) => isPair(a, b, p));
export const isHai = (a: string, b: string) => HAI.some((p) => isPair(a, b, p));
/** 兩相異地支同屬一個三合局(半合)。 */
export const isSanHePair = (a: string, b: string) => a !== b && SAN_HE.some(([g]) => inGroup(a, b, g));
/** 兩地支相刑:相異者同屬一組刑(含子卯),同字者看自刑。 */
export function isXing(a: string, b: string): boolean {
  if (a === b) return SELF_XING.includes(a as Branch);
  return [...SAN_XING, ZI_MAO_XING].some((g) => inGroup(a, b, g));
}
