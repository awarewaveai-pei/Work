import {
  ganHe,
  GAN_HE,
  HAI,
  isHai,
  isLiuChong,
  isLiuHe,
  LIU_CHONG,
  LIU_HE,
  SAN_HE,
  SAN_XING,
  SELF_XING,
  ZI_MAO_XING,
  type WuXing,
} from './ganzhi';

/**
 * 八字原局干支關係(純函式):天干五合、地支六合／三合／六沖／三刑／相害。
 *
 * 規則表與兩兩判定在 lib/ganzhi.ts(全站唯一來源)。
 * 只回「原局命中」的結構化清單,不判吉凶、不論合化成否 —— 敘事交 AI。
 * 三合只認三字全見(半合不列);三刑兩字以上同組即列,三字全見標 complete。
 */
export type PillarPosition = 'year' | 'month' | 'day' | 'hour';
export const PILLAR_POSITIONS: readonly PillarPosition[] = ['year', 'month', 'day', 'hour'];

export type RelationKind = 'ganHe' | 'liuHe' | 'sanHe' | 'chong' | 'xing' | 'hai';

export interface BaziRelation {
  kind: RelationKind;
  /** 參與的干或支(依柱位順序) */
  chars: string[];
  positions: PillarPosition[];
  /** 五合／三合所化五行 */
  element?: WuXing;
  /** 三刑:三字全見 */
  complete?: boolean;
}

export interface PillarChars {
  gan: Record<PillarPosition, string>;
  zhi: Record<PillarPosition, string>;
}

/** 兩兩柱位組合(year-month, year-day, …),順序固定。 */
function positionPairs(): Array<[PillarPosition, PillarPosition]> {
  const out: Array<[PillarPosition, PillarPosition]> = [];
  for (let i = 0; i < PILLAR_POSITIONS.length; i++) {
    for (let j = i + 1; j < PILLAR_POSITIONS.length; j++) {
      out.push([PILLAR_POSITIONS[i], PILLAR_POSITIONS[j]]);
    }
  }
  return out;
}

/** 集合型關係(三合、三刑組):回該組有出現的柱位、字與相異字數。 */
function groupHits(zhi: Record<PillarPosition, string>, group: readonly string[]) {
  const positions = PILLAR_POSITIONS.filter((p) => group.includes(zhi[p]));
  return {
    positions,
    chars: positions.map((p) => zhi[p]),
    distinct: new Set(positions.map((p) => zhi[p])).size,
  };
}

export function findBaziRelations({ gan, zhi }: PillarChars): BaziRelation[] {
  const out: BaziRelation[] = [];

  for (const [a, b] of positionPairs()) {
    const ga = gan[a], gb = gan[b], za = zhi[a], zb = zhi[b];
    const he = ganHe(ga, gb);
    if (he) out.push({ kind: 'ganHe', chars: [ga, gb], positions: [a, b], element: he });
    if (isLiuHe(za, zb)) out.push({ kind: 'liuHe', chars: [za, zb], positions: [a, b] });
    if (isLiuChong(za, zb)) out.push({ kind: 'chong', chars: [za, zb], positions: [a, b] });
    if (isHai(za, zb)) out.push({ kind: 'hai', chars: [za, zb], positions: [a, b] });
  }

  for (const [group, element] of SAN_HE) {
    const h = groupHits(zhi, group);
    if (h.distinct === 3) out.push({ kind: 'sanHe', chars: h.chars, positions: h.positions, element });
  }

  for (const group of SAN_XING) {
    const h = groupHits(zhi, group);
    if (h.distinct >= 2) out.push({ kind: 'xing', chars: h.chars, positions: h.positions, complete: h.distinct === 3 });
  }
  // 子卯相刑(無禮之刑)
  const ziMao = groupHits(zhi, ZI_MAO_XING);
  if (ziMao.distinct === 2) out.push({ kind: 'xing', chars: ziMao.chars, positions: ziMao.positions });
  // 自刑:同支重見
  for (const z of SELF_XING) {
    const positions = PILLAR_POSITIONS.filter((p) => zhi[p] === z);
    if (positions.length >= 2) out.push({ kind: 'xing', chars: positions.map(() => z), positions });
  }

  return out;
}

/** 依傳統口訣字序排列(如「乙庚」「辰戌」「寅巳申」),與柱位先後無關。 */
const CANONICAL_ORDER: Record<RelationKind, ReadonlyArray<readonly string[]>> = {
  ganHe: GAN_HE.map(([x, y]) => [x, y]),
  liuHe: LIU_HE,
  chong: LIU_CHONG,
  hai: HAI,
  sanHe: SAN_HE.map(([g]) => g),
  xing: [...SAN_XING, ZI_MAO_XING],
};

function canonical(r: BaziRelation): string {
  const group = CANONICAL_ORDER[r.kind].find((g) => r.chars.every((c) => g.includes(c)));
  if (!group) return r.chars.join(''); // 自刑(同字重見)
  return [...r.chars].sort((a, b) => group.indexOf(a) - group.indexOf(b)).join('');
}

/** 傳統術語寫法,如「乙庚合金」「辰戌沖」「寅巳申三刑」「午午自刑」(各語言共用的命理記法)。 */
export function relationTerm(r: BaziRelation): string {
  const c = canonical(r);
  switch (r.kind) {
    case 'ganHe': return `${c}合${r.element}`;
    case 'liuHe': return `${c}合`;
    case 'sanHe': return `${c}三合${r.element}局`;
    case 'chong': return `${c}沖`;
    case 'hai': return `${c}害`;
    case 'xing':
      if (new Set(r.chars).size === 1) return `${c}自刑`;
      return r.complete ? `${c}三刑` : `${c}相刑`;
  }
}
