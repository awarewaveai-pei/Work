import { Solar } from 'lunar-javascript';
import { ganZhiAt } from './ganzhi';

/** 干支年(立春年)的年柱,如 2026 → 丙午。 */
export function yearGanZhi(liChunYear: number): string {
  return ganZhiAt(liChunYear - 4);
}

/**
 * 只有日期、沒有時刻時的立春換年 —— 全站唯一判定:立春當日即算新年。
 * 借八字年柱(立春精確時刻換柱)取當日 23:59:59。有完整時刻者用 computeBazi 的年柱。
 */
export function liChunYear(year: number, month: number, day: number): number {
  const pillar = Solar.fromYmdHms(year, month, day, 23, 59, 59).getLunar().getEightChar().getYear();
  return pillar === yearGanZhi(year) ? year : year - 1;
}
