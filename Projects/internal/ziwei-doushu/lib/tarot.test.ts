import { describe, it, expect } from 'vitest';
import { TAROT_DECK, drawCards, drawSpread, SPREADS } from './tarot';
import type { SpreadId } from './tarot';
import { tarotSystem, toContext } from './divination/systems/tarot';

describe('塔羅牌庫', () => {
  it('恰 78 張(22 大 + 56 小)且 id 唯一、雙語齊備', () => {
    expect(TAROT_DECK).toHaveLength(78);
    expect(new Set(TAROT_DECK.map((c) => c.id)).size).toBe(78);
    expect(TAROT_DECK.filter((c) => c.arcana === 'major')).toHaveLength(22);
    expect(TAROT_DECK.filter((c) => c.arcana === 'minor')).toHaveLength(56);
    for (const c of TAROT_DECK) {
      expect(c.name['zh-TW']).toBeTruthy();
      expect(c.name.en).toBeTruthy();
    }
  });

  it('小牌命名雙語正確(權杖王牌 / Ace of Wands)', () => {
    const card = TAROT_DECK.find((c) => c.id === 'wands-ace');
    expect(card?.name['zh-TW']).toBe('權杖王牌');
    expect(card?.name.en).toBe('Ace of Wands');
  });
});

describe('抽牌 — 不放回 + 正逆位', () => {
  it('三張牌陣:3 張且不重複', () => {
    const r = drawSpread('three');
    expect(r.cards).toHaveLength(3);
    expect(new Set(r.cards.map((d) => d.card.id)).size).toBe(3);
  });

  it('凱爾特十字:10 張不重複', () => {
    const r = drawSpread('celtic');
    expect(new Set(r.cards.map((d) => d.card.id)).size).toBe(10);
  });

  it('rng→0:全逆位(reversed = 0<0.5)', () => {
    const cards = drawCards(5, () => 0);
    expect(cards).toHaveLength(5);
    expect(cards.every((d) => d.reversed)).toBe(true);
  });

  it('抽牌數越界丟錯', () => {
    expect(() => drawCards(0)).toThrow();
    expect(() => drawCards(79)).toThrow();
  });
});

describe('牌陣定義 SPREADS', () => {
  it('每個牌陣的 positions 長度(雙語)= size', () => {
    for (const id of Object.keys(SPREADS) as SpreadId[]) {
      const s = SPREADS[id];
      expect(s.positions['zh-TW']).toHaveLength(s.size);
      expect(s.positions.en).toHaveLength(s.size);
      expect(drawSpread(id).cards).toHaveLength(s.size);
    }
  });

  it('新增牌陣存在(關係/抉擇/是非)', () => {
    expect(SPREADS.relationship.size).toBe(3);
    expect(SPREADS.decision.size).toBe(3);
    expect(SPREADS.yesno.size).toBe(1);
  });
});

describe('塔羅系統 adapter — 牌位 + 情境', () => {
  it('compute → systemId=tarot + facts 帶牌位 + 正逆位', async () => {
    const { context, data } = await tarotSystem.compute(
      { spread: 'three', topic: 'love', rng: () => 0 },
      'zh-TW',
    );
    expect(context.systemId).toBe('tarot');
    expect(data.cards).toHaveLength(3);
    // 牌位標籤(過去/現在/未來)入 fact label
    expect(context.facts.some((f) => f.label === 'position:過去')).toBe(true);
    // 情境主題入 fact + headline
    expect(context.facts.find((f) => f.label === 'topic')?.value).toBe('感情');
    expect(context.headline).toContain('感情');
    // 牌面帶正逆位
    expect(
      context.facts.find((f) => f.label.startsWith('position:'))?.value,
    ).toContain('逆位');
  });

  it('toContext 不傳 topic 時無 topic fact', () => {
    const r = drawSpread('single', () => 0.9);
    const ctx = toContext(r, 'zh-TW');
    expect(ctx.facts.some((f) => f.label === 'topic')).toBe(false);
  });
});
