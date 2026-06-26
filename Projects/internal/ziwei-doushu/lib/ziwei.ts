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

/** 四化順序固定:祿 / 權 / 科 / 忌(對應 iztro horoscope mutagen 陣列順序)。 */
export const MUTAGEN_LABELS = ['祿', '權', '科', '忌'] as const;

/** 單一運限(大限/流年/流月/流日/流時)的四化摘要。 */
export interface ZiweiScope {
  /** 運限名(如「流年」) */
  name: string;
  /** 該運限天干 */
  heavenlyStem: string;
  /** 四化飛星 [化祿星, 化權星, 化科星, 化忌星] */
  mutagenStars: string[];
}

export interface ZiweiHoroscope {
  date: string;
  decadal: ZiweiScope; // 大限
  yearly: ZiweiScope; // 流年
  monthly: ZiweiScope; // 流月
  daily: ZiweiScope; // 流日
  /** 流時。⚠️ 需 timeIndex 才確定;computeHoroscope 未傳 timeIndex 時 iztro 取
   *  「呼叫當下時辰」→ 同 date 跨次呼叫可能不同。批次/持久化請務必傳入 timeIndex。 */
  hourly: ZiweiScope;
}

/** 把四化星陣列格式化為「天同化祿、天機化權…」。 */
export function formatMutagen(stars: string[]): string {
  return stars
    .map((s, i) => (s ? `${s}化${MUTAGEN_LABELS[i] ?? ''}` : ''))
    .filter(Boolean)
    .join('、');
}

/**
 * 運限(過運)計算 — 大限/流年/流月/流日/流時 + 各自四化飛星。
 *
 * 由排好的本命盤 + 目標日期推算(iztro horoscope)。本函式不碰 Date,呼叫端決定
 *   date(UI 傳今日 / 每日運勢工廠傳當日),保持可測。
 * 決定論:大限/流年/流月/流日 只取決於 date → 同 (astrolabe,date) 必同。流時另需
 *   timeIndex;不傳則 iztro 取「呼叫當下時辰」→ hourly 非確定(見 ZiweiHoroscope.hourly)。
 *   要 hourly 確定/可重現,務必傳入 timeIndex(0–11,子時起)。
 */
export function computeHoroscope(
  astrolabe: IFunctionalAstrolabe,
  date: string,
  timeIndex?: number,
): ZiweiHoroscope {
  const h = astrolabe.horoscope(date, timeIndex);
  const toScope = (s: {
    name: string;
    heavenlyStem: string;
    mutagen: string[];
  }): ZiweiScope => ({
    name: s.name,
    heavenlyStem: s.heavenlyStem,
    mutagenStars: s.mutagen ?? [],
  });
  return {
    date,
    decadal: toScope(h.decadal),
    yearly: toScope(h.yearly),
    monthly: toScope(h.monthly),
    daily: toScope(h.daily),
    hourly: toScope(h.hourly),
  };
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
