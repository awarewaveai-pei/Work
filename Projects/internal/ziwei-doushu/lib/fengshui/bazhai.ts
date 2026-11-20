import type { Gender } from '@/lib/ziwei';
import { annualStar, liChunYear, PALACE_DIRECTION, type Direction, type Palace } from './feixing';

/**
 * 八宅(八宅明鏡)命卦與遊年八方 — 純函式。
 *
 * 命卦(立春換年):男命 = 該年年紫白入中星;女命 = 6 − 男命(mod 9)。
 *   五黃無卦:男寄坤(2)、女寄艮(8)。
 * 遊年八方由伏位卦逐爻變推出(大遊年歌:上生氣、中五鬼、下延年、中六煞、
 *   上禍害、中天醫、下絕命、中伏位)。
 */

export type Star =
  | 'shengQi' // 生氣
  | 'tianYi' // 天醫
  | 'yanNian' // 延年
  | 'fuWei' // 伏位
  | 'jueMing' // 絕命
  | 'wuGui' // 五鬼
  | 'liuSha' // 六煞
  | 'huoHai'; // 禍害

export const AUSPICIOUS: readonly Star[] = ['shengQi', 'tianYi', 'yanNian', 'fuWei'];
export const INAUSPICIOUS: readonly Star[] = ['jueMing', 'wuGui', 'liuSha', 'huoHai'];

/** 三爻(初、中、上;1 = 陽) */
type Lines = readonly [number, number, number];
const TRIGRAM_LINES: Record<Exclude<Palace, 5>, Lines> = {
  6: [1, 1, 1], // 乾
  7: [1, 1, 0], // 兌
  9: [1, 0, 1], // 離
  3: [1, 0, 0], // 震
  4: [0, 1, 1], // 巽
  1: [0, 1, 0], // 坎
  8: [0, 0, 1], // 艮
  2: [0, 0, 0], // 坤
};

/** 大遊年歌的變爻順序(0 初 1 中 2 上)與所得遊年星 */
const YOU_NIAN: readonly [number, Star][] = [
  [2, 'shengQi'], [1, 'wuGui'], [0, 'yanNian'], [1, 'liuSha'],
  [2, 'huoHai'], [1, 'tianYi'], [0, 'jueMing'], [1, 'fuWei'],
];

function trigramOf(lines: Lines): Exclude<Palace, 5> {
  const hit = (Object.entries(TRIGRAM_LINES) as [string, Lines][]).find(
    ([, l]) => l[0] === lines[0] && l[1] === lines[1] && l[2] === lines[2],
  );
  return Number(hit![0]) as Exclude<Palace, 5>;
}

export interface BazhaiInput {
  birth: { year: number; month: number; day: number };
  gender: Gender;
}

export interface BazhaiResult {
  birthYear: number;
  /** 命卦(洛書數,已處理五黃寄宮) */
  gua: Exclude<Palace, 5>;
  group: 'east' | 'west';
  /** 遊年星 → 方位 */
  stars: Record<Star, Direction>;
}

export function computeBazhai(input: BazhaiInput): BazhaiResult {
  const birthYear = liChunYear(input.birth.year, input.birth.month, input.birth.day);
  const male = annualStar(birthYear);
  const raw = input.gender === '男' ? male : ((6 - male + 9) % 9) || 9;
  const gua = (raw === 5 ? (input.gender === '男' ? 2 : 8) : raw) as Exclude<Palace, 5>;

  let lines: [number, number, number] = [...TRIGRAM_LINES[gua]];
  const stars = {} as Record<Star, Direction>;
  for (const [line, star] of YOU_NIAN) {
    lines = [...lines];
    lines[line] = 1 - lines[line];
    stars[star] = PALACE_DIRECTION[trigramOf(lines)];
  }

  return {
    birthYear,
    gua,
    group: [1, 3, 4, 9].includes(gua) ? 'east' : 'west',
    stars,
  };
}
