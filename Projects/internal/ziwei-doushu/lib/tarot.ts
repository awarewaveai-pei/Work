import type { Locale } from './i18n/config';

/**
 * 塔羅 — 78 張牌庫(中英雙語)+ Fisher-Yates 抽牌(無種子,照競品演算法,PLAN §19)。
 * 牌義解讀由 AI 層產生;本模組提供牌庫結構 + 抽牌(正逆位、不放回)。
 */

export type Arcana = 'major' | 'minor';
export type SuitId = 'wands' | 'cups' | 'swords' | 'pentacles';

export interface TarotCard {
  id: string;
  arcana: Arcana;
  suit?: SuitId;
  /** 大阿爾克那編號 0–21 */
  number?: number;
  name: Record<Locale, string>;
}

const SUITS: Record<SuitId, Record<Locale, string>> = {
  wands: { 'zh-TW': '權杖', en: 'Wands' },
  cups: { 'zh-TW': '聖杯', en: 'Cups' },
  swords: { 'zh-TW': '寶劍', en: 'Swords' },
  pentacles: { 'zh-TW': '錢幣', en: 'Pentacles' },
};

const RANKS: ReadonlyArray<{ id: string; name: Record<Locale, string> }> = [
  { id: 'ace', name: { 'zh-TW': '王牌', en: 'Ace' } },
  { id: '2', name: { 'zh-TW': '二', en: 'Two' } },
  { id: '3', name: { 'zh-TW': '三', en: 'Three' } },
  { id: '4', name: { 'zh-TW': '四', en: 'Four' } },
  { id: '5', name: { 'zh-TW': '五', en: 'Five' } },
  { id: '6', name: { 'zh-TW': '六', en: 'Six' } },
  { id: '7', name: { 'zh-TW': '七', en: 'Seven' } },
  { id: '8', name: { 'zh-TW': '八', en: 'Eight' } },
  { id: '9', name: { 'zh-TW': '九', en: 'Nine' } },
  { id: '10', name: { 'zh-TW': '十', en: 'Ten' } },
  { id: 'page', name: { 'zh-TW': '侍者', en: 'Page' } },
  { id: 'knight', name: { 'zh-TW': '騎士', en: 'Knight' } },
  { id: 'queen', name: { 'zh-TW': '皇后', en: 'Queen' } },
  { id: 'king', name: { 'zh-TW': '國王', en: 'King' } },
];

const MAJOR_ARCANA: ReadonlyArray<Record<Locale, string>> = [
  { 'zh-TW': '愚者', en: 'The Fool' },
  { 'zh-TW': '魔術師', en: 'The Magician' },
  { 'zh-TW': '女祭司', en: 'The High Priestess' },
  { 'zh-TW': '皇后', en: 'The Empress' },
  { 'zh-TW': '皇帝', en: 'The Emperor' },
  { 'zh-TW': '教皇', en: 'The Hierophant' },
  { 'zh-TW': '戀人', en: 'The Lovers' },
  { 'zh-TW': '戰車', en: 'The Chariot' },
  { 'zh-TW': '力量', en: 'Strength' },
  { 'zh-TW': '隱者', en: 'The Hermit' },
  { 'zh-TW': '命運之輪', en: 'Wheel of Fortune' },
  { 'zh-TW': '正義', en: 'Justice' },
  { 'zh-TW': '吊人', en: 'The Hanged Man' },
  { 'zh-TW': '死神', en: 'Death' },
  { 'zh-TW': '節制', en: 'Temperance' },
  { 'zh-TW': '惡魔', en: 'The Devil' },
  { 'zh-TW': '高塔', en: 'The Tower' },
  { 'zh-TW': '星星', en: 'The Star' },
  { 'zh-TW': '月亮', en: 'The Moon' },
  { 'zh-TW': '太陽', en: 'The Sun' },
  { 'zh-TW': '審判', en: 'Judgement' },
  { 'zh-TW': '世界', en: 'The World' },
];

function buildDeck(): TarotCard[] {
  const deck: TarotCard[] = [];
  MAJOR_ARCANA.forEach((name, i) => {
    deck.push({ id: `major-${i}`, arcana: 'major', number: i, name });
  });
  (Object.keys(SUITS) as SuitId[]).forEach((suit) => {
    RANKS.forEach((rank) => {
      deck.push({
        id: `${suit}-${rank.id}`,
        arcana: 'minor',
        suit,
        name: {
          'zh-TW': `${SUITS[suit]['zh-TW']}${rank.name['zh-TW']}`,
          en: `${rank.name.en} of ${SUITS[suit].en}`,
        },
      });
    });
  });
  return deck;
}

export const TAROT_DECK: ReadonlyArray<TarotCard> = buildDeck();

export type SpreadId = 'single' | 'three' | 'celtic';
export const SPREAD_SIZE: Record<SpreadId, number> = {
  single: 1,
  three: 3,
  celtic: 10,
};

export interface DrawnCard {
  card: TarotCard;
  reversed: boolean;
}

export interface TarotResult {
  spread: SpreadId;
  cards: DrawnCard[];
}

/** Fisher-Yates 洗牌(不變動原陣列)。rng 預設 Math.random,可注入測試。 */
function shuffle<T>(arr: ReadonlyArray<T>, rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 抽 count 張(不放回),每張隨機正逆位。 */
export function drawCards(count: number, rng: () => number = Math.random): DrawnCard[] {
  if (count < 1 || count > TAROT_DECK.length) {
    throw new Error(`抽牌數須介於 1–${TAROT_DECK.length}: ${count}`);
  }
  return shuffle(TAROT_DECK, rng)
    .slice(0, count)
    .map((card) => ({ card, reversed: rng() < 0.5 }));
}

export function drawSpread(
  spread: SpreadId,
  rng: () => number = Math.random,
): TarotResult {
  return { spread, cards: drawCards(SPREAD_SIZE[spread], rng) };
}
