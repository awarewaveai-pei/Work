import { describe, it, expect } from 'vitest';
import { TAROT_DECK, drawCards, drawSpread, dailyCard, drawFollowUp, MAX_EXTRA_CARDS, secureInt, SPREADS, SPREAD_GROUPS } from './tarot';
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

  it('id 不重複,且每個牌陣都在某個分組裡恰好一次', () => {
    const ids = Object.keys(SPREADS);
    expect(ids.length).toBeGreaterThanOrEqual(40);
    const grouped = SPREAD_GROUPS.flatMap((g) => g.spreads.map((s) => s.id));
    expect(grouped).toHaveLength(ids.length);
    expect(new Set(grouped).size).toBe(ids.length);
  });

  it('新增三牌陣:鑽石 5 / 月相 4 / 馬蹄 7', () => {
    expect(SPREADS.diamond.size).toBe(5);
    expect(SPREADS.moon.size).toBe(4);
    expect(SPREADS.horseshoe.size).toBe(7);
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

describe('密碼學亂數', () => {
  it('secureInt 落在 [0,n),n=1 恆為 0,越界丟錯', () => {
    for (let i = 0; i < 200; i++) expect(secureInt(78)).toBeLessThan(78);
    expect(secureInt(1)).toBe(0);
    expect(() => secureInt(0)).toThrow();
  });

  it('預設抽牌(不注入 rng)不放回、張數正確', () => {
    const r = drawCards(10);
    expect(new Set(r.map((d) => d.card.id)).size).toBe(10);
  });
});

describe('每日一牌', () => {
  it('同一本地日期固定同一張牌與正逆位', () => {
    const d = { year: 2026, month: 11, day: 21 };
    expect(dailyCard(d)).toEqual(dailyCard({ ...d }));
  });

  it('連續 30 天不全相同', () => {
    const keys = new Set<string>();
    for (let day = 1; day <= 30; day++) {
      const c = dailyCard({ year: 2026, month: 11, day });
      keys.add(`${c.card.id}:${c.reversed}`);
    }
    expect(keys.size).toBeGreaterThan(1);
  });

  it('adapter:facts 標明每日一牌與日期', async () => {
    const { context } = await tarotSystem.compute(
      { spread: 'single', daily: { year: 2026, month: 11, day: 21 } },
      'zh-TW',
    );
    expect(context.facts.find((f) => f.label === 'mode')?.value).toBe('每日一牌 2026-11-21');
  });
});

describe('追問補抽', () => {
  it('只從剩餘牌堆抽:不與牌陣、先前補抽重複(凱爾特十字 + 三次 3 張)', () => {
    let r = drawSpread('celtic');
    for (let i = 0; i < 3; i++) r = drawFollowUp(r, 3);
    const all = [...r.cards, ...(r.extra ?? [])].map((d) => d.card.id);
    expect(r.extra).toHaveLength(9);
    expect(new Set(all).size).toBe(all.length);
  });

  it('注入 rng 恆回 0(最易撞牌)時,補牌仍不與主牌重複', () => {
    const r = drawFollowUp(drawSpread('single', () => 0), 3, () => 0);
    const ids = [...r.cards, ...(r.extra ?? [])].map((d) => d.card.id);
    expect(new Set(ids).size).toBe(4);
  });

  it('張數須 1–3、累計不超過上限;不改原物件', () => {
    const r = drawSpread('three');
    expect(() => drawFollowUp(r, 0)).toThrow();
    expect(() => drawFollowUp(r, 4)).toThrow();
    expect(() => drawFollowUp(r, 1.5)).toThrow();
    const r9 = drawFollowUp(drawFollowUp(drawFollowUp(r, 3), 3), 3);
    expect(r9.extra).toHaveLength(MAX_EXTRA_CARDS);
    expect(() => drawFollowUp(r9, 1)).toThrow();
    expect(r.extra).toBeUndefined();
  });

  it('adapter:補牌進 facts 以 followup 標示,不佔牌位', async () => {
    const r = drawFollowUp(drawSpread('single', () => 0), 2, () => 0);
    const ctx = toContext(r, 'zh-TW');
    expect(ctx.facts.filter((f) => f.label.startsWith('followup:'))).toHaveLength(2);
    expect(ctx.facts.filter((f) => f.label.startsWith('position:'))).toHaveLength(1);
  });
});
