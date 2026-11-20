import { determineJu, type JuResult, type QimenTime } from './ju';
import { layPlate, type QimenPlate } from './plate';

/**
 * 奇門遁甲(時家・轉盤・拆補法・中五寄坤)— 起局時刻 → 完整盤面。
 * 口徑細節見 ./ju.ts(定局)與 ./plate.ts(布盤)檔頭。
 */
export type QimenResult = JuResult & { plate: QimenPlate; time: QimenTime };

export function computeQimen(time: QimenTime): QimenResult {
  const ju = determineJu(time);
  return { ...ju, time, plate: layPlate(ju.dun, ju.ju, ju.pillars.hour) };
}

export type { QimenTime, Yuan } from './ju';
export type { Deity, Door, Dun, Palace, QimenPalace, QimenPlate, Star } from './plate';
