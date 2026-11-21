import { describe, it, expect } from 'vitest';
import { HEXAGRAM_TEXTS, USE_NINE, USE_SIX } from './text';
import { hexagramFromSums } from '../iching';

describe('周易經文資料', () => {
  it('64 卦辭 + 384 爻辭 + 用九用六', () => {
    expect(HEXAGRAM_TEXTS).toHaveLength(64);
    expect(HEXAGRAM_TEXTS.flatMap((h) => h.lines)).toHaveLength(384);
    expect(USE_NINE).toBe('用九：見群龍无首，吉。');
    expect(USE_SIX).toBe('用六：利永貞。');
  });

  it('每條爻辭的爻題與該卦的陰陽爻相符(384 條)', () => {
    const POS = ['初', '二', '三', '四', '五', '上'];
    const byNumber = new Map<number, number[]>();
    for (let b = 0; b < 64; b++) {
      const sums = Array.from({ length: 6 }, (_, i) => ((b >> i) & 1 ? 7 : 8));
      const h = hexagramFromSums('', sums).primary;
      byNumber.set(h.number, h.lines);
    }
    HEXAGRAM_TEXTS.forEach((t, idx) => {
      const lines = byNumber.get(idx + 1)!;
      t.lines.forEach((text, i) => {
        const yy = lines[i] ? '九' : '六';
        const title = i === 0 || i === 5 ? `${POS[i]}${yy}` : `${yy}${POS[i]}`;
        expect(text.startsWith(`${title}：`), `第 ${idx + 1} 卦第 ${i + 1} 爻`).toBe(true);
      });
    });
  });

  it('卦序對齊文王序:乾、坤、坎、既濟、未濟的卦辭與初爻', () => {
    const at = (n: number) => HEXAGRAM_TEXTS[n - 1];
    expect(at(1).judgment).toBe('乾，元亨利貞。');
    expect(at(1).lines[0]).toBe('初九：潛龍勿用。');
    expect(at(2).judgment).toBe(
      '坤，元亨，利牝馬之貞。君子有攸往，先迷後得主，利西南得朋，東北喪朋。安貞吉。',
    );
    expect(at(2).lines[0]).toBe('初六：履霜，堅冰至。');
    expect(at(29).judgment).toBe('習坎，有孚，維心亨，行有尚。');
    expect(at(29).lines[0]).toBe('初六：習坎，入于坎窞，凶。');
    expect(at(63).judgment).toBe('既濟，亨小，利貞；初吉終亂。');
    expect(at(63).lines[0]).toBe('初九：曳其輪，濡其尾，无咎。');
    expect(at(64).judgment).toBe('未濟，亨；小狐汔濟，濡其尾，无攸利。');
    expect(at(64).lines[0]).toBe('初六：濡其尾，吝。');
  });
});
