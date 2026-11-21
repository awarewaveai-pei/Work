/** 年月日。本檔不可 import 任何曆法庫:純前端頁面(塔羅)只為了「今天」不該載入 lunar-javascript。 */
export interface Ymd {
  year: number;
  month: number;
  day: number;
}

/** 使用者所在時區的今天。不可用 toISOString():那是 UTC,台灣 08:00 前是昨天。 */
export function localToday(now: Date = new Date()): Ymd {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}
