import { Lunar } from 'lunar-javascript';
import type { CalendarType } from './ziwei';

export interface Ymd {
  year: number;
  month: number;
  day: number;
}

/**
 * 出生日期一律先落到國曆,之後的真太陽時校正與排盤只認國曆。
 * 農曆年月日不是國曆日期:直接拿去算均時差或加減分鐘會錯(農曆二月三十會被當成三月二日)。
 * 閏月以負月份表示;該年無此閏月或該月無此日時 lunar-javascript 會拋錯。國曆無此日亦拋錯。
 */
export function toSolarYmd(d: Ymd & { calendar: CalendarType; isLeapMonth?: boolean }): Ymd {
  if (d.calendar !== 'lunar') {
    // Date 會把 2/30 靜默推成 3/2;不存在的日期在入口擋下,後面的校正與排盤才不會排到別天。
    const t = new Date(Date.UTC(d.year, d.month - 1, d.day));
    if (t.getUTCMonth() !== d.month - 1 || t.getUTCDate() !== d.day) {
      throw new Error(`無此國曆日期: ${d.year}-${d.month}-${d.day}`);
    }
    return { year: d.year, month: d.month, day: d.day };
  }
  const s = Lunar.fromYmdHms(d.year, d.isLeapMonth ? -d.month : d.month, d.day, 0, 0, 0).getSolar();
  return { year: s.getYear(), month: s.getMonth(), day: s.getDay() };
}

/** 使用者所在時區的今天。不可用 toISOString():那是 UTC,台灣 08:00 前是昨天。 */
export function localToday(now: Date = new Date()): Ymd {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}
