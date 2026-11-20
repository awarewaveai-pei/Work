import { PILLAR_POSITIONS, type PillarChars, type PillarPosition } from './baziRelations';

/**
 * 八字常用神煞(純函式,查表)。神煞只作旁證,不單獨論命。
 *
 * 口徑同 bazi-skill references/shensha-table.md(MIT):起查字可為自身所在柱
 *   (如日支午起將星,日支自身即見)。天乙貴人庚干取「甲戊庚牛羊」與「庚辛逢虎馬」聯集。
 */
export type ShenshaId =
  | 'tianYi' | 'wenChang' | 'taoHua' | 'yiMa' | 'huaGai' | 'yangRen' | 'luShen' | 'jiangXing';

export interface ShenshaHit {
  id: ShenshaId;
  /** 傳統名(繁中) */
  name: string;
  /** 命中的地支所在柱位 */
  positions: PillarPosition[];
  /** 起查依據,如「年干/日干查地支」 */
  basis: string;
  /** 查法出處(典籍) */
  source: string;
}

interface ShenshaRule {
  id: ShenshaId;
  name: string;
  basis: string;
  source: string;
  /** 回該命局要找的地支集合 */
  targets: (c: PillarChars) => string[];
}

/** 三合局 → 所屬局首字(申子辰=水局…),神煞以局查表。 */
const SAN_HE_OF: Record<string, '申' | '寅' | '巳' | '亥'> = {
  申: '申', 子: '申', 辰: '申',
  寅: '寅', 午: '寅', 戌: '寅',
  巳: '巳', 酉: '巳', 丑: '巳',
  亥: '亥', 卯: '亥', 未: '亥',
};
type SanHeTable = Record<'申' | '寅' | '巳' | '亥', string>;
const byYearAndDayZhi = (table: SanHeTable) => (c: PillarChars) => [
  table[SAN_HE_OF[c.zhi.year]],
  table[SAN_HE_OF[c.zhi.day]],
];

const TIAN_YI: Record<string, string[]> = {
  甲: ['丑', '未'], 戊: ['丑', '未'], 庚: ['丑', '未', '寅', '午'],
  乙: ['子', '申'], 己: ['子', '申'],
  丙: ['亥', '酉'], 丁: ['亥', '酉'],
  壬: ['卯', '巳'], 癸: ['卯', '巳'],
  辛: ['寅', '午'],
};
const WEN_CHANG: Record<string, string> = {
  甲: '巳', 乙: '午', 丙: '申', 丁: '酉', 戊: '申', 己: '酉', 庚: '亥', 辛: '子', 壬: '寅', 癸: '卯',
};
const LU: Record<string, string> = {
  甲: '寅', 乙: '卯', 丙: '巳', 丁: '午', 戊: '巳', 己: '午', 庚: '申', 辛: '酉', 壬: '亥', 癸: '子',
};
const YANG_REN: Record<string, string> = {
  甲: '卯', 乙: '寅', 丙: '午', 丁: '巳', 戊: '午', 己: '巳', 庚: '酉', 辛: '子', 壬: '子', 癸: '亥',
};

const RULES: readonly ShenshaRule[] = [
  {
    id: 'tianYi', name: '天乙貴人', basis: '年干／日干查地支', source: '《三命通會》',
    targets: (c) => [...TIAN_YI[c.gan.year], ...TIAN_YI[c.gan.day]],
  },
  {
    id: 'wenChang', name: '文昌', basis: '年干／日干查地支', source: '《三命通會》',
    targets: (c) => [WEN_CHANG[c.gan.year], WEN_CHANG[c.gan.day]],
  },
  {
    id: 'taoHua', name: '桃花(咸池)', basis: '年支／日支三合查地支', source: '《淵海子平》',
    targets: byYearAndDayZhi({ 申: '酉', 寅: '卯', 巳: '午', 亥: '子' }),
  },
  {
    id: 'yiMa', name: '驛馬', basis: '年支／日支三合查地支', source: '《三命通會》',
    targets: byYearAndDayZhi({ 申: '寅', 寅: '申', 巳: '亥', 亥: '巳' }),
  },
  {
    id: 'huaGai', name: '華蓋', basis: '年支／日支三合查地支', source: '《三命通會》',
    targets: byYearAndDayZhi({ 申: '辰', 寅: '戌', 巳: '丑', 亥: '未' }),
  },
  {
    id: 'jiangXing', name: '將星', basis: '年支／日支三合查地支', source: '《三命通會》',
    targets: byYearAndDayZhi({ 申: '子', 寅: '午', 巳: '酉', 亥: '卯' }),
  },
  {
    id: 'luShen', name: '祿神', basis: '日干查地支', source: '《淵海子平》',
    targets: (c) => [LU[c.gan.day]],
  },
  {
    id: 'yangRen', name: '羊刃', basis: '日干查地支', source: '《三命通會》',
    targets: (c) => [YANG_REN[c.gan.day]],
  },
];

/** 回原局命中的神煞(依 RULES 順序;未命中不列)。 */
export function findShensha(chars: PillarChars): ShenshaHit[] {
  const out: ShenshaHit[] = [];
  for (const rule of RULES) {
    const targets = new Set(rule.targets(chars));
    const positions = PILLAR_POSITIONS.filter((p) => targets.has(chars.zhi[p]));
    if (positions.length > 0) {
      out.push({ id: rule.id, name: rule.name, positions, basis: rule.basis, source: rule.source });
    }
  }
  return out;
}
