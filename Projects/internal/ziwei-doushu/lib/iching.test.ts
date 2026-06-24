import { describe, it, expect } from 'vitest';
import { castHexagram, allHexagramBinaries } from './iching';
import { ichingSystem } from './divination/systems/iching';

describe('卜卦 64 卦資料完整性', () => {
  it('恰 64 卦且二進位皆唯一(抓組合錯字的安全網)', () => {
    const bins = allHexagramBinaries();
    expect(bins).toHaveLength(64);
    expect(new Set(bins).size).toBe(64);
  });
});

describe('castHexagram — 確定性錨點', () => {
  it('全老陽(rng→0.99):本卦乾為天、六爻全動、變卦坤為地', () => {
    const r = castHexagram('測試', () => 0.99);
    expect(r.primary.number).toBe(1);
    expect(r.primary.name).toBe('乾為天');
    expect(r.movingLines).toEqual([0, 1, 2, 3, 4, 5]);
    expect(r.changed?.number).toBe(2);
    expect(r.changed?.name).toBe('坤為地');
  });

  it('全老陰(rng→0):本卦坤為地、變卦乾為天', () => {
    const r = castHexagram('測試', () => 0);
    expect(r.primary.number).toBe(2);
    expect(r.changed?.number).toBe(1);
  });

  it('全少陽(每爻 2,2,3 → sum7 靜):本卦乾為天、無動爻無變卦', () => {
    const seq = [0.1, 0.1, 0.9];
    let i = 0;
    const rng = () => seq[i++ % seq.length];
    const r = castHexagram('問事業', rng);
    expect(r.primary.name).toBe('乾為天');
    expect(r.movingLines).toEqual([]);
    expect(r.changed).toBeUndefined();
    expect(r.question).toBe('問事業');
  });
});

describe('卜卦系統 adapter', () => {
  it('compute → systemId=iching + headline 含卦名', async () => {
    const { context } = await ichingSystem.compute(
      { question: '測試', rng: () => 0.99 },
      'zh-TW',
    );
    expect(context.systemId).toBe('iching');
    expect(context.headline).toContain('乾為天');
  });
});
