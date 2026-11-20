import { Solar } from 'lunar-javascript';
import { BRANCHES, ganZhiIndex, STEMS } from '../ganzhi';
import { type Dun } from './plate';

/**
 * 奇門遁甲・拆補法定局 — 起局時刻 → 四柱、節氣、三元、陰陽遁、局數。
 *
 * 口徑:
 * - 時刻為 UTC+8 牆上時間(不做真太陽時);節氣與干支取自 lunar-javascript,節氣精確到秒。
 * - 23:00 起換日(早子時屬次日),日柱與時柱皆依此。
 * - 拆補法:節氣一到即用該節氣;元由日柱符頭(該日以前最近的甲/己日)地支定:
 *   子午卯酉 上元、寅申巳亥 中元、辰戌丑未 下元。不做超神接氣、置閏。
 * - 冬至至芒種 陽遁,夏至至大雪 陰遁;局數依「陰陽遁十八局」口訣。
 */

export type Yuan = 'upper' | 'middle' | 'lower';

/** 節氣 → 陰陽遁與 [上元, 中元, 下元] 局數 */
const JU_TABLE: Record<string, { dun: Dun; ju: [number, number, number] }> = {
  冬至: { dun: 'yang', ju: [1, 7, 4] }, 小寒: { dun: 'yang', ju: [2, 8, 5] },
  大寒: { dun: 'yang', ju: [3, 9, 6] }, 立春: { dun: 'yang', ju: [8, 5, 2] },
  雨水: { dun: 'yang', ju: [9, 6, 3] }, 驚蟄: { dun: 'yang', ju: [1, 7, 4] },
  春分: { dun: 'yang', ju: [3, 9, 6] }, 清明: { dun: 'yang', ju: [4, 1, 7] },
  穀雨: { dun: 'yang', ju: [5, 2, 8] }, 立夏: { dun: 'yang', ju: [4, 1, 7] },
  小滿: { dun: 'yang', ju: [5, 2, 8] }, 芒種: { dun: 'yang', ju: [6, 3, 9] },
  夏至: { dun: 'yin', ju: [9, 3, 6] }, 小暑: { dun: 'yin', ju: [8, 2, 5] },
  大暑: { dun: 'yin', ju: [7, 1, 4] }, 立秋: { dun: 'yin', ju: [2, 5, 8] },
  處暑: { dun: 'yin', ju: [1, 4, 7] }, 白露: { dun: 'yin', ju: [9, 3, 6] },
  秋分: { dun: 'yin', ju: [7, 1, 4] }, 寒露: { dun: 'yin', ju: [6, 9, 3] },
  霜降: { dun: 'yin', ju: [5, 8, 2] }, 立冬: { dun: 'yin', ju: [6, 9, 3] },
  小雪: { dun: 'yin', ju: [5, 8, 2] }, 大雪: { dun: 'yin', ju: [4, 7, 1] },
};

/** lunar-javascript 節氣名為簡體;與繁體不同的只有這五個 */
const JIEQI_T: Record<string, string> = {
  惊蛰: '驚蟄', 谷雨: '穀雨', 小满: '小滿', 芒种: '芒種', 处暑: '處暑',
};

const YUAN_ORDER: Yuan[] = ['upper', 'middle', 'lower'];

export interface QimenTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface JuResult {
  pillars: { year: string; month: string; day: string; hour: string };
  /** 起局所用節氣與交節時刻 */
  jieqi: { name: string; at: string };
  /** 日柱符頭,如 己卯 */
  futou: string;
  yuan: Yuan;
  dun: Dun;
  ju: number;
}

/** 日柱 → 符頭與元 */
export function yuanOf(dayGanZhi: string): { futou: string; yuan: Yuan } {
  const i = ganZhiIndex(dayGanZhi);
  const f = i - (i % 5);
  const zhi = f % 12;
  // 子午卯酉(0,6,3,9)上、寅申巳亥(2,8,5,11)中、辰戌丑未(4,10,1,7)下
  const yuan: Yuan = zhi % 3 === 0 ? 'upper' : zhi % 3 === 2 ? 'middle' : 'lower';
  return { futou: STEMS[f % 10] + BRANCHES[zhi], yuan };
}

export function juOf(jieqi: string, yuan: Yuan): { dun: Dun; ju: number } {
  const row = JU_TABLE[jieqi];
  if (!row) throw new Error(`未知節氣: ${jieqi}`);
  return { dun: row.dun, ju: row.ju[YUAN_ORDER.indexOf(yuan)] };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function determineJu(t: QimenTime): JuResult {
  const lunar = Solar.fromYmdHms(t.year, t.month, t.day, t.hour, t.minute, 0).getLunar();
  const pillars = {
    year: lunar.getYearInGanZhiExact(),
    month: lunar.getMonthInGanZhiExact(),
    day: lunar.getDayInGanZhiExact(),
    hour: lunar.getTimeInGanZhi(),
  };
  const jq = lunar.getPrevJieQi(false);
  const raw = jq.getName();
  const name = JIEQI_T[raw] ?? raw;
  const s = jq.getSolar();
  const at = `${s.getYear()}-${pad(s.getMonth())}-${pad(s.getDay())} ${pad(s.getHour())}:${pad(s.getMinute())}`;
  const { futou, yuan } = yuanOf(pillars.day);
  return { pillars, jieqi: { name, at }, futou, yuan, ...juOf(name, yuan) };
}
