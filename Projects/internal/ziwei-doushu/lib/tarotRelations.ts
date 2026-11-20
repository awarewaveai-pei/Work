import type { Locale } from './i18n/config';
import type { DrawnCard, SuitId } from './tarot';

/**
 * 塔羅牌間關係 — 純函式,不經 AI。做法改寫自 daman-ovo-0404/tarot-skill(MIT,
 * 見 THIRD_PARTY_NOTICES.md):花色/元素分布、大阿爾克那比例、相鄰牌關係。
 */

export type MajorLevel = 'high' | 'mixed' | 'low';

export type PairKind =
  | 'suit_up' // 同花色數字上升
  | 'suit_down' // 同花色數字下降
  | 'major_up' // 大牌編號上升
  | 'major_down' // 大牌編號下降
  | 'mirror21' // 兩張大牌編號和為 21
  | 'same_number' // 同數字不同花色
  | 'element_help' // 元素相助(火風、水土)
  | 'element_clash' // 元素相剋(火水、風土)
  | 'court_event'; // 宮廷牌 + 事件牌

export interface PairRelation {
  /** 相鄰兩張牌的索引(from + 1 = to) */
  from: number;
  to: number;
  kinds: PairKind[];
}

export interface TarotRelations {
  /** 小阿爾克那 3 張以上同花色 = 主導 */
  dominantSuits: SuitId[];
  /** 缺席花色;牌數 ≥ 5 才判(牌太少時缺席不具意義) */
  absentSuits: SuitId[];
  majorCount: number;
  /** 單張牌為 null */
  majorLevel: MajorLevel | null;
  pairs: PairRelation[];
}

const ALL_SUITS: SuitId[] = ['wands', 'cups', 'swords', 'pentacles'];
const ELEMENT: Record<SuitId, 'fire' | 'water' | 'air' | 'earth'> = {
  wands: 'fire',
  cups: 'water',
  swords: 'air',
  pentacles: 'earth',
};
const ABSENT_MIN_CARDS = 5;
const COURT = new Set(['page', 'knight', 'queen', 'king']);

/** 小牌數字 1–10(王牌 = 1);宮廷牌與大牌回 null。 */
function pipNumber(d: DrawnCard): number | null {
  if (d.card.arcana !== 'minor') return null;
  const rank = d.card.id.split('-')[1];
  if (rank === 'ace') return 1;
  const n = Number(rank);
  return Number.isInteger(n) ? n : null;
}

function isCourt(d: DrawnCard): boolean {
  return d.card.arcana === 'minor' && COURT.has(d.card.id.split('-')[1]);
}

function elementsRelate(a: SuitId, b: SuitId): 'element_help' | 'element_clash' | null {
  const pair = new Set([ELEMENT[a], ELEMENT[b]]);
  if (pair.size < 2) return null;
  if (pair.has('fire') && pair.has('air')) return 'element_help';
  if (pair.has('water') && pair.has('earth')) return 'element_help';
  if (pair.has('fire') && pair.has('water')) return 'element_clash';
  if (pair.has('air') && pair.has('earth')) return 'element_clash';
  return null;
}

function pairKinds(a: DrawnCard, b: DrawnCard): PairKind[] {
  const kinds: PairKind[] = [];
  const ca = a.card;
  const cb = b.card;

  if (ca.arcana === 'major' && cb.arcana === 'major') {
    const x = ca.number as number;
    const y = cb.number as number;
    if (y > x) kinds.push('major_up');
    else if (y < x) kinds.push('major_down');
    if (x + y === 21) kinds.push('mirror21');
  }

  if (ca.arcana === 'minor' && cb.arcana === 'minor') {
    const pa = pipNumber(a);
    const pb = pipNumber(b);
    if (ca.suit === cb.suit && pa !== null && pb !== null) {
      if (pb > pa) kinds.push('suit_up');
      else if (pb < pa) kinds.push('suit_down');
    }
    if (ca.suit !== cb.suit) {
      if (pa !== null && pa === pb) kinds.push('same_number');
      const el = elementsRelate(ca.suit as SuitId, cb.suit as SuitId);
      if (el) kinds.push(el);
    }
  }

  // 宮廷牌 = 角色,另一張(事件:數字牌或大牌)= 發生的事
  if ((isCourt(a) && !isCourt(b)) || (isCourt(b) && !isCourt(a))) kinds.push('court_event');
  return kinds;
}

export function computeTarotRelations(cards: ReadonlyArray<DrawnCard>): TarotRelations {
  if (cards.length < 2) {
    return { dominantSuits: [], absentSuits: [], majorCount: 0, majorLevel: null, pairs: [] };
  }

  const suitCount: Record<SuitId, number> = { wands: 0, cups: 0, swords: 0, pentacles: 0 };
  let majorCount = 0;
  for (const d of cards) {
    if (d.card.arcana === 'major') majorCount++;
    else suitCount[d.card.suit as SuitId]++;
  }

  const ratio = majorCount / cards.length;
  const majorLevel: MajorLevel = ratio > 0.5 ? 'high' : ratio >= 0.3 ? 'mixed' : 'low';

  const pairs: PairRelation[] = [];
  for (let i = 0; i < cards.length - 1; i++) {
    const kinds = pairKinds(cards[i], cards[i + 1]);
    if (kinds.length) pairs.push({ from: i, to: i + 1, kinds });
  }

  return {
    dominantSuits: ALL_SUITS.filter((s) => suitCount[s] >= 3),
    absentSuits: cards.length >= ABSENT_MIN_CARDS ? ALL_SUITS.filter((s) => suitCount[s] === 0) : [],
    majorCount,
    majorLevel,
    pairs,
  };
}

const SUIT_NAME: Record<SuitId, Record<Locale, string>> = {
  wands: { 'zh-TW': '權杖(火)', en: 'Wands (fire)' },
  cups: { 'zh-TW': '聖杯(水)', en: 'Cups (water)' },
  swords: { 'zh-TW': '寶劍(風)', en: 'Swords (air)' },
  pentacles: { 'zh-TW': '錢幣(土)', en: 'Pentacles (earth)' },
};

const MAJOR_TEXT: Record<MajorLevel, Record<Locale, string>> = {
  high: {
    'zh-TW': '大牌占多數:這是重大轉折的課題',
    en: 'Mostly Major Arcana: a turning point of real weight',
  },
  mixed: {
    'zh-TW': '大牌占三到五成:命運的推力與個人的選擇並存',
    en: 'Major Arcana 30–50%: larger forces and your own choices both at work',
  },
  low: {
    'zh-TW': '大牌不到三成:日常的選擇與行動是主導,主動權在你手上',
    en: 'Major Arcana under 30%: everyday choices lead; the initiative is yours',
  },
};

const PAIR_TEXT: Record<PairKind, Record<Locale, string>> = {
  suit_up: { 'zh-TW': '同花色數字上升,事情在推進', en: 'same suit, number rising: it is progressing' },
  suit_down: { 'zh-TW': '同花色數字下降,回到起點重整', en: 'same suit, number falling: a reset or return' },
  major_up: { 'zh-TW': '大牌編號上升,往下一個階段走', en: 'Major numbers rising: moving to the next stage' },
  major_down: { 'zh-TW': '大牌編號下降,有前一階段的課題要補', en: 'Major numbers falling: an earlier lesson to revisit' },
  mirror21: { 'zh-TW': '編號相加為 21,兩張牌互為鏡像、形成張力', en: 'numbers sum to 21: mirror cards, a charged tension' },
  same_number: { 'zh-TW': '同數字不同花色,同一階段在不同領域共振', en: 'same number, different suits: one stage echoing across areas' },
  element_help: { 'zh-TW': '元素相助,能量互相加成', en: 'elements support each other' },
  element_clash: { 'zh-TW': '元素相剋,能量互相拉扯', en: 'elements clash, pulling against each other' },
  court_event: { 'zh-TW': '一張是人物(宮廷牌),另一張是發生的事', en: 'one card is a person (court), the other the event' },
};

export interface RelationLine {
  /** 穩定英文鍵(給 facts label) */
  key: string;
  text: string;
}

/** 把結構化關係轉成各語言的句子(facts 與畫面共用,避免兩邊說法不一致)。 */
export function describeRelations(
  rel: TarotRelations,
  cards: ReadonlyArray<DrawnCard>,
  locale: Locale,
): RelationLine[] {
  const lines: RelationLine[] = [];
  const sep = locale === 'en' ? ', ' : '、';
  if (rel.majorLevel) {
    lines.push({
      key: 'relation:major',
      text: `${rel.majorCount}/${cards.length} ${MAJOR_TEXT[rel.majorLevel][locale]}`,
    });
  }
  if (rel.dominantSuits.length) {
    const names = rel.dominantSuits.map((s) => SUIT_NAME[s][locale]).join(sep);
    lines.push({
      key: 'relation:suit-dominant',
      text: locale === 'en' ? `Dominant suit: ${names}` : `主導花色:${names}`,
    });
  }
  if (rel.absentSuits.length) {
    const names = rel.absentSuits.map((s) => SUIT_NAME[s][locale]).join(sep);
    lines.push({
      key: 'relation:suit-absent',
      text: locale === 'en' ? `Absent suit (possibly overlooked): ${names}` : `缺席花色(可能被忽視的面向):${names}`,
    });
  }
  for (const p of rel.pairs) {
    const a = cards[p.from].card.name[locale];
    const b = cards[p.to].card.name[locale];
    lines.push({
      key: `relation:pair-${p.from + 1}-${p.to + 1}`,
      text: `${a} → ${b}:${p.kinds.map((k) => PAIR_TEXT[k][locale]).join(sep)}`,
    });
  }
  return lines;
}
