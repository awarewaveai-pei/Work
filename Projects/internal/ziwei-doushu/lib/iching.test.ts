import { describe, it, expect } from 'vitest';
import { castHexagram, allHexagramBinaries, hexagramFromSums } from './iching';
import { ichingSystem, toContext } from './divination/systems/iching';
import { selectReading } from './iching/reading';
import { HEXAGRAM_TEXTS, USE_NINE, USE_SIX } from './iching/text';

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

describe('變爻讀法(朱熹《易學啟蒙》)— 七種情況', () => {
  const T = (n: number) => HEXAGRAM_TEXTS[n - 1];
  const plan = (sums: number[]) => {
    const r = hexagramFromSums('q', sums);
    return { r, p: selectReading(r) };
  };

  it('0 動:讀本卦卦辭', () => {
    const { p } = plan([7, 7, 7, 7, 7, 7]);
    expect(p.rule).toBe(0);
    expect(p.passages).toEqual([{ source: 'primary', kind: 'judgment', text: T(1).judgment, main: true }]);
  });

  it('1 動:讀本卦該動爻', () => {
    const { p } = plan([9, 7, 7, 7, 7, 7]);
    expect(p.rule).toBe(1);
    expect(p.passages.map((x) => [x.source, x.line, x.text, x.main])).toEqual([
      ['primary', 0, '初九：潛龍勿用。', true],
    ]);
  });

  it('2 動:讀本卦兩動爻,上爻為主且在前', () => {
    const { p } = plan([9, 7, 9, 7, 7, 7]);
    expect(p.rule).toBe(2);
    expect(p.passages.map((x) => [x.source, x.line, x.text, x.main])).toEqual([
      ['primary', 2, T(1).lines[2], true],
      ['primary', 0, T(1).lines[0], false],
    ]);
  });

  it('3 動:讀本卦與變卦卦辭,本卦在前,不分主從', () => {
    const { r, p } = plan([9, 9, 9, 7, 7, 7]);
    expect(r.changed?.number).toBe(12); // 天地否
    expect(p.rule).toBe(3);
    expect(p.passages.map((x) => [x.source, x.kind, x.text, x.main])).toEqual([
      ['primary', 'judgment', T(1).judgment, false],
      ['changed', 'judgment', T(12).judgment, false],
    ]);
  });

  it('4 動:讀變卦兩個不動爻,下爻為主且在前', () => {
    const { r, p } = plan([9, 9, 9, 9, 7, 7]);
    expect(r.changed?.number).toBe(20); // 風地觀
    expect(p.rule).toBe(4);
    expect(p.passages.map((x) => [x.source, x.line, x.text, x.main])).toEqual([
      ['changed', 4, '九五：觀我生，君子无咎。', true],
      ['changed', 5, T(20).lines[5], false],
    ]);
  });

  it('5 動:讀變卦那個不動爻', () => {
    const { r, p } = plan([9, 9, 9, 9, 9, 7]);
    expect(r.changed?.number).toBe(23); // 山地剝
    expect(p.rule).toBe(5);
    expect(p.passages.map((x) => [x.source, x.line, x.text, x.main])).toEqual([
      ['changed', 5, T(23).lines[5], true],
    ]);
  });

  it('6 動:讀變卦卦辭;乾讀用九、坤讀用六', () => {
    expect(plan([9, 9, 9, 9, 9, 9]).p).toEqual({
      rule: 'use9',
      passages: [{ source: 'primary', kind: 'use', text: USE_NINE, main: true }],
    });
    expect(plan([6, 6, 6, 6, 6, 6]).p).toEqual({
      rule: 'use6',
      passages: [{ source: 'primary', kind: 'use', text: USE_SIX, main: true }],
    });
    const { r, p } = plan([6, 9, 9, 6, 9, 9]); // 巽為風 → 震為雷
    expect([r.primary.number, r.changed?.number]).toEqual([57, 51]);
    expect(p).toEqual({
      rule: 6,
      passages: [{ source: 'changed', kind: 'judgment', text: T(51).judgment, main: true }],
    });
  });
});

describe('卜卦 facts 帶經文', () => {
  it('三動:本卦/變卦卦辭、該讀段落與說明都在 facts,且不超過 API 上限', () => {
    const ctx = toContext(hexagramFromSums('問事業', [9, 9, 9, 7, 7, 7]), 'zh-TW');
    const get = (label: string) => ctx.facts.find((f) => f.label === label)?.value;
    expect(get('primaryJudgment')).toBe(HEXAGRAM_TEXTS[0].judgment);
    expect(get('changedJudgment')).toBe(HEXAGRAM_TEXTS[11].judgment);
    expect(get('readingRule')).toBe('三爻動:讀本卦與變卦的卦辭,本卦在前。');
    expect(get('reading1.primary.judgment')).toBe(HEXAGRAM_TEXTS[0].judgment);
    expect(get('reading2.changed.judgment')).toBe(HEXAGRAM_TEXTS[11].judgment);
    expect(ctx.facts.length).toBeLessThanOrEqual(60);
    for (const f of ctx.facts) {
      expect(f.label.length).toBeLessThanOrEqual(60);
      expect(f.value.length).toBeLessThanOrEqual(300);
    }
  });
});
