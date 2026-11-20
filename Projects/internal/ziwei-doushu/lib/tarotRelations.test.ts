import { describe, it, expect } from 'vitest';
import { TAROT_DECK, drawSpread, type DrawnCard } from './tarot';
import { computeTarotRelations, describeRelations } from './tarotRelations';
import { toContext } from './divination/systems/tarot';

const pick = (...ids: string[]): DrawnCard[] =>
  ids.map((id) => ({ card: TAROT_DECK.find((c) => c.id === id)!, reversed: false }));
const kinds = (cards: DrawnCard[], i = 0) => computeTarotRelations(cards).pairs[i]?.kinds ?? [];

describe('牌間關係', () => {
  it('單張牌回空結果', () => {
    expect(computeTarotRelations(pick('major-0'))).toEqual({
      dominantSuits: [],
      absentSuits: [],
      majorCount: 0,
      majorLevel: null,
      pairs: [],
    });
  });

  it('3 張同花色 = 主導;5 張以上才判缺席', () => {
    const r = computeTarotRelations(pick('cups-ace', 'cups-4', 'cups-9', 'wands-3', 'major-1'));
    expect(r.dominantSuits).toEqual(['cups']);
    expect(r.absentSuits).toEqual(['swords', 'pentacles']);
    expect(computeTarotRelations(pick('cups-ace', 'cups-4', 'cups-9')).absentSuits).toEqual([]);
  });

  it('大阿爾克那比例分級', () => {
    expect(computeTarotRelations(pick('major-1', 'major-2', 'cups-2')).majorLevel).toBe('high');
    expect(computeTarotRelations(pick('major-1', 'cups-2')).majorLevel).toBe('mixed');
    expect(computeTarotRelations(pick('major-1', 'major-2', 'cups-2', 'cups-3', 'cups-4')).majorLevel).toBe('mixed');
    expect(computeTarotRelations(pick('major-1', 'cups-2', 'cups-3', 'cups-4', 'wands-2', 'wands-3', 'swords-2', 'swords-3')).majorLevel).toBe('low');
  });

  it('同花色數字升降', () => {
    expect(kinds(pick('cups-3', 'cups-7'))).toContain('suit_up');
    expect(kinds(pick('cups-ace', 'cups-ace'))).toEqual([]);
    expect(kinds(pick('cups-7', 'cups-3'))).toContain('suit_down');
  });

  it('大牌編號升降與和為 21', () => {
    expect(kinds(pick('major-13', 'major-17'))).toContain('major_up');
    expect(kinds(pick('major-17', 'major-13'))).toContain('major_down');
    expect(kinds(pick('major-10', 'major-11'))).toEqual(['major_up', 'mirror21']);
  });

  it('元素相助相剋、同數字不同花色', () => {
    expect(kinds(pick('wands-4', 'swords-6'))).toEqual(['element_help']);
    expect(kinds(pick('cups-4', 'pentacles-6'))).toEqual(['element_help']);
    expect(kinds(pick('wands-4', 'cups-6'))).toEqual(['element_clash']);
    expect(kinds(pick('swords-4', 'pentacles-6'))).toEqual(['element_clash']);
    expect(kinds(pick('wands-5', 'cups-5'))).toEqual(['same_number', 'element_clash']);
  });

  it('宮廷牌 + 事件牌', () => {
    expect(kinds(pick('cups-queen', 'major-16'))).toEqual(['court_event']);
    expect(kinds(pick('cups-queen', 'wands-king'))).not.toContain('court_event');
  });

  it('凱爾特十字 10 張:facts 數與長度不超過 /api/interpret 上限', () => {
    for (let i = 0; i < 200; i++) {
      const ctx = toContext(drawSpread('celtic'), i % 2 ? 'en' : 'zh-TW', 'love');
      expect(ctx.facts.length).toBeLessThanOrEqual(60);
      for (const f of ctx.facts) {
        expect(f.label.length).toBeLessThanOrEqual(60);
        expect(f.value.length).toBeLessThanOrEqual(300);
      }
    }
  });

  it('describeRelations 兩語言都產出句子,單張無', () => {
    const cards = pick('major-16', 'major-17');
    expect(describeRelations(computeTarotRelations(cards), cards, 'zh-TW').length).toBeGreaterThan(0);
    expect(describeRelations(computeTarotRelations(cards), cards, 'en')[0].text).toMatch(/Major/);
    expect(describeRelations(computeTarotRelations(pick('major-0')), pick('major-0'), 'en')).toEqual([]);
  });
});
