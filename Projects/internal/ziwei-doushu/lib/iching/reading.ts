import type { Locale } from '@/lib/i18n/config';
import type { IChingResult } from '@/lib/iching';
import { HEXAGRAM_TEXTS, USE_NINE, USE_SIX } from './text';

/**
 * 變爻讀法(朱熹《易學啟蒙》):依動爻數決定讀哪幾段經文。純函式,本專案自行實作。
 *
 * | 動爻 | 讀 |
 * |---|---|
 * | 0 | 本卦卦辭 |
 * | 1 | 本卦該動爻 |
 * | 2 | 本卦兩動爻,上爻為主 |
 * | 3 | 本卦與變卦卦辭,本卦在前(不加權重) |
 * | 4 | 變卦兩個不動爻,下爻為主 |
 * | 5 | 變卦那個不動爻 |
 * | 6 | 變卦卦辭;乾讀用九、坤讀用六 |
 */

export type ReadingRule = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 'use9' | 'use6';

export interface ReadingPassage {
  source: 'primary' | 'changed';
  kind: 'judgment' | 'line' | 'use';
  /** 爻位 0=初爻 … 5=上爻(kind='line' 才有) */
  line?: number;
  /** 經文原文 */
  text: string;
  /** 主讀段落 */
  main: boolean;
}

export interface ReadingPlan {
  rule: ReadingRule;
  /** 依閱讀順序;有主讀時主讀在第一條 */
  passages: ReadingPassage[];
}

/** 每種情況的一句說明(事實與畫面共用)。 */
export const READING_RULE_TEXT: Record<ReadingRule, Record<Locale, string>> = {
  0: {
    'zh-TW': '無動爻:讀本卦卦辭。',
    en: 'No moving lines: read the primary hexagram’s judgment.',
  },
  1: {
    'zh-TW': '一爻動:讀本卦這一個動爻的爻辭。',
    en: 'One moving line: read that line of the primary hexagram.',
  },
  2: {
    'zh-TW': '二爻動:讀本卦兩個動爻的爻辭,以上面那一爻為主。',
    en: 'Two moving lines: read both lines of the primary hexagram; the upper one leads.',
  },
  3: {
    'zh-TW': '三爻動:讀本卦與變卦的卦辭,本卦在前。',
    en: 'Three moving lines: read the judgments of the primary and the changed hexagram, primary first.',
  },
  4: {
    'zh-TW': '四爻動:讀變卦兩個不動爻的爻辭,以下面那一爻為主。',
    en: 'Four moving lines: read the two unchanging lines of the changed hexagram; the lower one leads.',
  },
  5: {
    'zh-TW': '五爻動:讀變卦唯一不動那一爻的爻辭。',
    en: 'Five moving lines: read the one unchanging line of the changed hexagram.',
  },
  6: {
    'zh-TW': '六爻全動:讀變卦卦辭。',
    en: 'All six lines move: read the changed hexagram’s judgment.',
  },
  use9: {
    'zh-TW': '六爻全動:乾卦讀「用九」。',
    en: 'All six lines move: for Qian, read “Use of Nines” (用九).',
  },
  use6: {
    'zh-TW': '六爻全動:坤卦讀「用六」。',
    en: 'All six lines move: for Kun, read “Use of Sixes” (用六).',
  },
};

export function selectReading(r: IChingResult): ReadingPlan {
  const moving = [...r.movingLines].sort((a, b) => a - b);
  const still = [0, 1, 2, 3, 4, 5].filter((i) => !moving.includes(i));
  const primary = HEXAGRAM_TEXTS[r.primary.number - 1];
  const changedNo = r.changed?.number;
  const changed = changedNo ? HEXAGRAM_TEXTS[changedNo - 1] : undefined;
  if (moving.length > 0 && !changed) throw new Error('有動爻卻沒有變卦');

  const line = (source: 'primary' | 'changed', i: number, main: boolean): ReadingPassage => ({
    source,
    kind: 'line',
    line: i,
    text: (source === 'primary' ? primary : changed!).lines[i],
    main,
  });

  switch (moving.length) {
    case 0:
      return { rule: 0, passages: [{ source: 'primary', kind: 'judgment', text: primary.judgment, main: true }] };
    case 1:
      return { rule: 1, passages: [line('primary', moving[0], true)] };
    case 2:
      return { rule: 2, passages: [line('primary', moving[1], true), line('primary', moving[0], false)] };
    case 3:
      return {
        rule: 3,
        passages: [
          { source: 'primary', kind: 'judgment', text: primary.judgment, main: false },
          { source: 'changed', kind: 'judgment', text: changed!.judgment, main: false },
        ],
      };
    case 4:
      return { rule: 4, passages: [line('changed', still[0], true), line('changed', still[1], false)] };
    case 5:
      return { rule: 5, passages: [line('changed', still[0], true)] };
    default:
      if (r.primary.number === 1)
        return { rule: 'use9', passages: [{ source: 'primary', kind: 'use', text: USE_NINE, main: true }] };
      if (r.primary.number === 2)
        return { rule: 'use6', passages: [{ source: 'primary', kind: 'use', text: USE_SIX, main: true }] };
      return { rule: 6, passages: [{ source: 'changed', kind: 'judgment', text: changed!.judgment, main: true }] };
  }
}
