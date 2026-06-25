import { astro } from 'iztro';
import type { IFunctionalAstrolabe } from 'iztro/lib/astro/FunctionalAstrolabe';
import {
  toTrueSolarTime,
  hourToTimeIndex,
  type TrueSolarResult,
} from './trueSolarTime';
import { localeToIztroLang, defaultLocale, type Locale } from './i18n/config';

export type Gender = '男' | '女';
export type CalendarType = 'solar' | 'lunar';

export interface ChartRequest {
  /** YYYY-MM-DD (solar) 或 lunar 年月日字串 */
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  gender: Gender;
  calendar: CalendarType;
  /** 農曆閏月 (僅 calendar=lunar 時有效) */
  isLeapMonth?: boolean;
  /** 真太陽時校正設定；不給則用鐘錶時間直接排盤 */
  trueSolar?: {
    longitude: number;
    tzOffsetHours: number;
  };
  /** 命盤資料語言（對應 iztro 語言碼）；不給預設繁中 */
  locale?: Locale;
}

export interface ChartResult {
  astrolabe: IFunctionalAstrolabe;
  /** 實際用於排盤的時辰索引 */
  timeIndex: number;
  /** 真太陽時校正明細 (若啟用) */
  correction?: TrueSolarResult;
}

/**
 * 排盤主入口。流程：
 *   (真太陽時校正?) -> 決定時辰索引 -> iztro 安星
 *
 * 紫微斗數安星法為確定性算法，準度取決於「時辰是否正確」，故真太陽時校正
 * 是本站的準度核心 (見 trueSolarTime.ts)。
 */
export function computeChart(req: ChartRequest): ChartResult {
  let { year, month, day, hour } = req;
  let correction: TrueSolarResult | undefined;

  // 真太陽時校正只在國曆有意義 (農曆已是日期層級，時辰仍可校正)
  if (req.trueSolar) {
    correction = toTrueSolarTime({
      year: req.year,
      month: req.month,
      day: req.day,
      hour: req.hour,
      minute: req.minute,
      longitude: req.trueSolar.longitude,
      tzOffsetHours: req.trueSolar.tzOffsetHours,
    });
    year = correction.year;
    month = correction.month;
    day = correction.day;
    hour = correction.hour;
  }

  const timeIndex = hourToTimeIndex(hour);
  const dateStr = `${year}-${month}-${day}`;
  const iztroLang = localeToIztroLang(req.locale ?? defaultLocale);

  const astrolabe =
    req.calendar === 'lunar'
      ? astro.byLunar(
          dateStr,
          timeIndex,
          req.gender,
          req.isLeapMonth ?? false,
          true,
          iztroLang as Parameters<typeof astro.byLunar>[5],
        )
      : astro.bySolar(
          dateStr,
          timeIndex,
          req.gender,
          true,
          iztroLang as Parameters<typeof astro.bySolar>[4],
        );

  return { astrolabe, timeIndex, correction };
}
