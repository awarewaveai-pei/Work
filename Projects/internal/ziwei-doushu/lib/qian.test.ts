import { describe, expect, it } from 'vitest';
import { drawQian, QIAN_LOTS } from './qian';
import { SINGLE_SOURCE_TITLES, SINGLE_WITNESS_LINES } from './qian/data';

describe('觀音靈籤資料', () => {
  it('共 100 首,籤號 1–100 不重複', () => {
    expect(QIAN_LOTS).toHaveLength(100);
    expect(QIAN_LOTS.map((l) => l.no)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });

  it('每首四句、每句七個字', () => {
    for (const lot of QIAN_LOTS) {
      expect(lot.poem, `第 ${lot.no} 籤`).toHaveLength(4);
      for (const line of lot.poem) expect([...line], `第 ${lot.no} 籤:${line}`).toHaveLength(7);
    }
  });

  it('只有甲一個見證者的籤詩句與籤題清單,恰為校勘規則算出的結果', () => {
    expect(SINGLE_WITNESS_LINES).toEqual([
      [9, 4], [11, 3], [14, 2], [15, 1], [15, 2], [19, 4], [21, 2], [21, 4], [35, 4], [37, 4], [38, 3],
      [40, 2], [48, 1], [48, 4], [49, 2], [49, 4], [64, 4], [66, 1], [68, 1], [72, 4], [92, 3], [98, 2],
    ]);
    expect(SINGLE_SOURCE_TITLES).toEqual([3, 65, 66, 89, 99]);
  });
});

describe('drawQian', () => {
  it('亂數 0 得第 1 籤,0.999… 得第 100 籤', () => {
    expect(drawQian(() => 0).no).toBe(1);
    expect(drawQian(() => 0.9999999999).no).toBe(100);
  });
});
