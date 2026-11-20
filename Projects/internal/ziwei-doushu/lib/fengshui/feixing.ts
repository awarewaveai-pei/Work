import { Solar } from 'lunar-javascript';

/**
 * 玄空飛星(沈氏玄空學)— 純函式,只算事實,解讀交給 AI 層。
 *
 * 宮位用洛書數:1坎北 2坤西南 3震東 4巽東南 5中 6乾西北 7兌西 8艮東北 9離南。
 * 兼向門檻採常見「9-3-3」分法:離本山中線 > 4.5° 視為兼向,改用替卦起星。
 */

export type Palace = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type Direction = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'C';

export const PALACE_DIRECTION: Record<Palace, Direction> = {
  1: 'N', 2: 'SW', 3: 'E', 4: 'SE', 5: 'C', 6: 'NW', 7: 'W', 8: 'NE', 9: 'S',
};

/** 二十四山,自壬(中線 345°)順時針。每三山一卦,依序為地元/天元/人元。 */
export const MOUNTAINS = [
  '壬', '子', '癸', '丑', '艮', '寅', '甲', '卯', '乙', '辰', '巽', '巳',
  '丙', '午', '丁', '未', '坤', '申', '庚', '酉', '辛', '戌', '乾', '亥',
] as const;
export type Mountain = (typeof MOUNTAINS)[number];

const GROUP_PALACE: readonly Palace[] = [1, 8, 3, 4, 9, 2, 7, 6];
/** 順飛路徑:中→乾→兌→艮→離→坎→坤→震→巽 */
const FLIGHT_PATH: readonly Palace[] = [5, 6, 7, 8, 9, 1, 2, 3, 4];

/** 替星訣:子癸甲申貪狼;壬卯乙未坤巨門;乾亥辰巽巳戌武曲;酉辛丑艮丙破軍;寅午庚丁右弼。 */
const REPLACEMENT_STAR: Record<Mountain, number> = {
  子: 1, 癸: 1, 甲: 1, 申: 1,
  壬: 2, 卯: 2, 乙: 2, 未: 2, 坤: 2,
  乾: 6, 亥: 6, 辰: 6, 巽: 6, 巳: 6, 戌: 6,
  酉: 7, 辛: 7, 丑: 7, 艮: 7, 丙: 7,
  寅: 9, 午: 9, 庚: 9, 丁: 9,
};

const JIAN_THRESHOLD_DEG = 4.5;

const mod = (n: number, m: number) => ((n % m) + m) % m;
/** 1..9 循環(0 → 9) */
const wrap9 = (n: number) => mod(n - 1, 9) + 1;

export function palaceOfMountain(i: number): Palace {
  return GROUP_PALACE[Math.floor(mod(i, 24) / 3)];
}

/**
 * 陰陽:四正卦(坎離震兌)地元陽、天人元陰;四隅卦(乾坤艮巽)地元陰、天人元陽。
 */
function isYang(i: number): boolean {
  const yuan = mod(i, 3); // 0 地元 1 天元 2 人元
  const corner = [2, 4, 6, 8].includes(palaceOfMountain(i));
  return corner ? yuan !== 0 : yuan === 0;
}

export interface MountainReading {
  index: number;
  mountain: Mountain;
  palace: Palace;
  /** 離本山中線的偏角(負 = 偏向前一山) */
  deviation: number;
  /** 兼向時所兼的鄰山;下卦為 null */
  jian: Mountain | null;
}

/** 羅盤度數 → 二十四山(含兼向判定)。 */
export function degreeToMountain(degree: number): MountainReading {
  const offset = mod(degree - 337.5, 360);
  const index = Math.floor(offset / 15);
  const deviation = offset - index * 15 - 7.5;
  const jian =
    Math.abs(deviation) > JIAN_THRESHOLD_DEG
      ? MOUNTAINS[mod(index + Math.sign(deviation), 24)]
      : null;
  return { index, mountain: MOUNTAINS[index], palace: palaceOfMountain(index), deviation, jian };
}

const GAN = '甲乙丙丁戊己庚辛壬癸';
const ZHI = '子丑寅卯辰巳午未申酉戌亥';

/** 以立春換年;借八字年柱(立春精確時刻換柱),只給日期時立春當日即算新年。 */
export function liChunYear(year: number, month: number, day: number): number {
  const pillar = Solar.fromYmdHms(year, month, day, 23, 59, 59).getLunar().getEightChar().getYear();
  const i = mod(year - 4, 60);
  return pillar === GAN[i % 10] + ZHI[i % 12] ? year : year - 1;
}

/** 三元九運:1864 起一運,每運 20 年。 */
export function periodOfYear(year: number): number {
  return mod(Math.floor((year - 1864) / 20), 9) + 1;
}

/** 年紫白入中星(2017 一白,逐年遞減)。 */
export function annualStar(year: number): number {
  return wrap9(1 - (year - 2017));
}

/** 從中宮起 start 星,順或逆飛布九宮。 */
export function fly(start: number, forward: boolean): Record<Palace, number> {
  const out = {} as Record<Palace, number>;
  FLIGHT_PATH.forEach((p, k) => {
    out[p] = wrap9(forward ? start + k : start - k);
  });
  return out;
}

/**
 * 山星/向星起星:取運盤該宮星數 n,找 n 宮中與本山同元的山,依其陰陽定順逆。
 * n = 5 無卦可取,依本山陰陽。替卦只換入中星數(用同元山之替星),順逆不變。
 */
function startStar(n: number, mountainIndex: number, useReplacement: boolean) {
  if (n === 5) return { star: 5, forward: isYang(mountainIndex) };
  const group = GROUP_PALACE.indexOf(n as Palace);
  const counterpart = group * 3 + mod(mountainIndex, 3);
  return {
    star: useReplacement ? REPLACEMENT_STAR[MOUNTAINS[counterpart]] : n,
    forward: isYang(counterpart),
  };
}

export type FeixingPattern =
  | 'wangShanWangXiang' // 旺山旺向
  | 'shangShanXiaShui' // 上山下水
  | 'shuangXingDaoXiang' // 雙星到向
  | 'shuangXingDaoZuo' // 雙星到坐
  | 'none';

export interface PalaceStars {
  palace: Palace;
  direction: Direction;
  period: number;
  mountain: number;
  facing: number;
  annual: number;
}

export interface FeixingInput {
  /** 向的羅盤度數 0–359(大門／主要採光面朝向) */
  facingDegree: number;
  /** 入伙或建成日期(立春換年) */
  moveIn: { year: number; month: number; day: number };
  /** 流年(節氣年) */
  flowYear: number;
}

export interface FeixingResult {
  /** 正規化到 0–359.x 的輸入度數 */
  facingDegree: number;
  facing: MountainReading;
  sitting: { mountain: Mountain; palace: Palace };
  /** 兼向 → 以替卦起星 */
  replaced: boolean;
  moveInYear: number;
  period: number;
  flowYear: number;
  annualCenter: number;
  /** 依洛書 1..9 排列 */
  palaces: PalaceStars[];
  pattern: FeixingPattern;
}

export function computeFeixing(input: FeixingInput): FeixingResult {
  const facing = degreeToMountain(input.facingDegree);
  const sitIndex = mod(facing.index + 12, 24);
  const sitPalace = palaceOfMountain(sitIndex);
  const moveInYear = liChunYear(input.moveIn.year, input.moveIn.month, input.moveIn.day);
  const period = periodOfYear(moveInYear);
  const replaced = facing.jian !== null;

  const periodPlate = fly(period, true);
  const m = startStar(periodPlate[sitPalace], sitIndex, replaced);
  const f = startStar(periodPlate[facing.palace], facing.index, replaced);
  const mountainPlate = fly(m.star, m.forward);
  const facingPlate = fly(f.star, f.forward);
  const annualCenter = annualStar(input.flowYear);
  const annualPlate = fly(annualCenter, true);

  const palaces = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as Palace[]).map((p) => ({
    palace: p,
    direction: PALACE_DIRECTION[p],
    period: periodPlate[p],
    mountain: mountainPlate[p],
    facing: facingPlate[p],
    annual: annualPlate[p],
  }));

  const at = (plate: Record<Palace, number>, p: Palace) => plate[p] === period;
  let pattern: FeixingPattern = 'none';
  if (at(mountainPlate, sitPalace) && at(facingPlate, sitPalace)) pattern = 'shuangXingDaoZuo';
  else if (at(mountainPlate, facing.palace) && at(facingPlate, facing.palace)) pattern = 'shuangXingDaoXiang';
  else if (at(mountainPlate, sitPalace) && at(facingPlate, facing.palace)) pattern = 'wangShanWangXiang';
  else if (at(mountainPlate, facing.palace) && at(facingPlate, sitPalace)) pattern = 'shangShanXiaShui';

  return {
    facingDegree: mod(input.facingDegree, 360),
    facing,
    sitting: { mountain: MOUNTAINS[sitIndex], palace: sitPalace },
    replaced,
    moveInYear,
    period,
    flowYear: input.flowYear,
    annualCenter,
    palaces,
    pattern,
  };
}
