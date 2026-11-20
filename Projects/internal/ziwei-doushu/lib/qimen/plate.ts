/**
 * 奇門遁甲・轉盤布盤 — 純函式,只吃「陰陽遁 + 局數 + 時柱」,不碰曆法。
 *
 * 口徑(全站唯一):時家奇門、轉盤、中五宮寄坤二。
 * - 地盤:戊落局數宮,依 戊己庚辛壬癸丁丙乙 陽遁 1→9 順布、陰遁逆布(含中五)。
 * - 值符/值使:時柱旬首所藏六儀在地盤的宮 → 該宮本位星/門;旬首在中五 → 值符天禽、值使死門(寄坤)。
 * - 天盤九星:值符星移到時干所在地盤宮(時干為甲 → 用旬首六儀;落中五 → 坤二),
 *   八星沿外環整體旋轉,各帶本宮地盤干;天禽與天芮同行,帶中五地盤干。
 * - 八門:值使從旬首宮起,依時柱距旬首的時數,陽遁 1→9 順數、陰遁逆數(含中五,落中五 → 坤二),
 *   八門沿外環整體旋轉(陰陽遁皆不倒序)。
 * - 八神:值符(神)隨天盤值符星,陽遁順時針、陰遁逆時針。
 * 外環順時針(上南下北的畫法):坎1 → 艮8 → 震3 → 巽4 → 離9 → 坤2 → 兌7 → 乾6。
 */

import { BRANCHES, ganZhiAt, ganZhiIndex } from '../ganzhi';

export type Palace = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type Dun = 'yang' | 'yin';

export type Star = '天蓬' | '天任' | '天沖' | '天輔' | '天英' | '天芮' | '天柱' | '天心' | '天禽';
export type Door = '休門' | '生門' | '傷門' | '杜門' | '景門' | '死門' | '驚門' | '開門';
export type Deity = '值符' | '螣蛇' | '太陰' | '六合' | '白虎' | '玄武' | '九地' | '九天';

/** 地盤布干次序(三奇六儀) */
const YI_QI = ['戊', '己', '庚', '辛', '壬', '癸', '丁', '丙', '乙'] as const;
/** 六甲旬首所遁之儀:甲子戊、甲戌己、甲申庚、甲午辛、甲辰壬、甲寅癸 */
const XUN_YI: Record<string, string> = {
  甲子: '戊', 甲戌: '己', 甲申: '庚', 甲午: '辛', 甲辰: '壬', 甲寅: '癸',
};

export const RING: readonly Palace[] = [1, 8, 3, 4, 9, 2, 7, 6];
const HOME_STAR: Record<Palace, Star> = {
  1: '天蓬', 2: '天芮', 3: '天沖', 4: '天輔', 5: '天禽', 6: '天心', 7: '天柱', 8: '天任', 9: '天英',
};
const HOME_DOOR: Partial<Record<Palace, Door>> = {
  1: '休門', 2: '死門', 3: '傷門', 4: '杜門', 6: '開門', 7: '驚門', 8: '生門', 9: '景門',
};
const DEITIES: readonly Deity[] = ['值符', '螣蛇', '太陰', '六合', '白虎', '玄武', '九地', '九天'];

/** 地支所在宮 */
const ZHI_PALACE: Record<string, Palace> = {
  子: 1, 丑: 8, 寅: 8, 卯: 3, 辰: 4, 巳: 4, 午: 9, 未: 2, 申: 2, 酉: 7, 戌: 6, 亥: 6,
};
/** 驛馬:申子辰馬在寅、寅午戌馬在申、巳酉丑馬在亥、亥卯未馬在巳 */
const MA: Record<string, string> = {
  申: '寅', 子: '寅', 辰: '寅', 寅: '申', 午: '申', 戌: '申', 巳: '亥', 酉: '亥', 丑: '亥', 亥: '巳', 卯: '巳', 未: '巳',
};

export interface QimenPalace {
  palace: Palace;
  /** 地盤干 */
  earthStem: string;
  /** 坤二宮另寄的中五地盤干;其餘宮 null */
  earthStemJi: string | null;
  /** 天盤干(中五宮 null) */
  heavenStem: string | null;
  /** 天芮所到之宮另帶的天禽(中五)干;其餘宮 null */
  heavenStemJi: string | null;
  door: Door | null;
  star: Star | null;
  /** 天禽與天芮同宮 */
  starJi: boolean;
  deity: Deity | null;
  kong: boolean;
  ma: boolean;
}

export interface QimenPlate {
  dun: Dun;
  ju: number;
  hour: string;
  /** 時柱旬首,如 甲子 */
  xunShou: string;
  /** 旬首所遁之儀,如 戊 */
  xunYi: string;
  /** 旬首在地盤的宮(可能為 5) */
  xunPalace: Palace;
  zhiFu: { star: Star; palace: Palace };
  zhiShi: { door: Door; palace: Palace };
  /** 時柱旬空兩支 */
  kongZhi: string;
  kongPalaces: Palace[];
  ma: { zhi: string; palace: Palace };
  /** 依宮號 1..9 排列 */
  palaces: QimenPalace[];
}

const mod = (n: number, m: number) => ((n % m) + m) % m;
const ji = (p: Palace): Palace => (p === 5 ? 2 : p);
const ringIdx = (p: Palace) => RING.indexOf(p);

/** 宮號 1..9 依陽順陰逆走 n 步 */
function stepPalace(from: Palace, n: number, dun: Dun): Palace {
  return (mod(from - 1 + (dun === 'yang' ? n : -n), 9) + 1) as Palace;
}

export function layPlate(dun: Dun, ju: number, hour: string): QimenPlate {
  if (!Number.isInteger(ju) || ju < 1 || ju > 9) throw new Error(`局數須為 1..9: ${ju}`);
  const hourIdx = ganZhiIndex(hour);
  const xunShou = ganZhiAt(hourIdx - (hourIdx % 10));
  const xunYi = XUN_YI[xunShou];
  const sinceXun = hourIdx % 10;

  // 地盤
  const earth = {} as Record<Palace, string>;
  YI_QI.forEach((stem, k) => {
    earth[stepPalace(ju as Palace, k, dun)] = stem;
  });
  const earthPalaceOf = (stem: string) =>
    (Object.keys(earth).map(Number) as Palace[]).find((p) => earth[p] === stem)!;

  // 值符、值使
  const xunPalace = earthPalaceOf(xunYi);
  const fromPalace = ji(xunPalace);
  const zhiFuStar = HOME_STAR[xunPalace];
  const zhiShiDoor = HOME_DOOR[fromPalace]!;

  // 天盤九星:值符星落時干之地盤宮
  const hourStem = hour[0] === '甲' ? xunYi : hour[0];
  const starTarget = ji(earthPalaceOf(hourStem));
  const starShift = ringIdx(starTarget) - ringIdx(fromPalace);

  // 八門:值使隨時數
  const doorTarget = ji(stepPalace(xunPalace, sinceXun, dun));
  const doorShift = ringIdx(doorTarget) - ringIdx(fromPalace);

  const palaces: QimenPalace[] = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as Palace[]).map((p) => ({
    palace: p,
    earthStem: earth[p],
    earthStemJi: p === 2 ? earth[5] : null,
    heavenStem: null,
    heavenStemJi: null,
    door: null,
    star: null,
    starJi: false,
    deity: null,
    kong: false,
    ma: false,
  }));
  const at = (p: Palace) => palaces[p - 1];

  RING.forEach((home, i) => {
    const sp = RING[mod(i + starShift, 8)];
    at(sp).star = HOME_STAR[home];
    at(sp).heavenStem = earth[home];
    if (home === 2) {
      at(sp).starJi = true;
      at(sp).heavenStemJi = earth[5];
    }
    at(RING[mod(i + doorShift, 8)]).door = HOME_DOOR[home]!;
  });

  const step = dun === 'yang' ? 1 : -1;
  DEITIES.forEach((d, k) => {
    at(RING[mod(ringIdx(starTarget) + step * k, 8)]).deity = d;
  });

  const kongZhi = BRANCHES[mod(hourIdx % 12 - sinceXun - 2, 12)] + BRANCHES[mod(hourIdx % 12 - sinceXun - 1, 12)];
  const kongPalaces = [...new Set([...kongZhi].map((z) => ZHI_PALACE[z]))];
  for (const p of kongPalaces) at(p).kong = true;
  const maZhi = MA[hour[1]];
  const maPalace = ZHI_PALACE[maZhi];
  at(maPalace).ma = true;

  return {
    dun,
    ju,
    hour,
    xunShou,
    xunYi,
    xunPalace,
    zhiFu: { star: zhiFuStar, palace: starTarget },
    zhiShi: { door: zhiShiDoor, palace: doorTarget },
    kongZhi,
    kongPalaces,
    ma: { zhi: maZhi, palace: maPalace },
    palaces,
  };
}
