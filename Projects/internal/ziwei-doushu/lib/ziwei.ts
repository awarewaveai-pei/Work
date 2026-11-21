import { astro } from 'iztro';
import type { IFunctionalAstrolabe } from 'iztro/lib/astro/FunctionalAstrolabe';
import {
  toTrueSolarTime,
  hourToTimeIndex,
  type TrueSolarResult,
} from './trueSolarTime';
import { localeToIztroLang, defaultLocale, type Locale } from './i18n/config';
import { toSolarYmd } from './dates';
import type { Config, Option } from 'iztro/lib/data/types';

/**
 * 晚子時(23 時,timeIndex 12)日界口徑:全站唯一設定處。
 * 'forward' = 整張盤(日、月、年、閏月)換到次日;'current' = 整張盤歸當日。
 * 上游預設 forward。要改口徑只改這一行。
 */
export const ZIWEI_DAY_DIVIDE: NonNullable<Config['dayDivide']> = 'forward';

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
  /** 流時。未傳 timeIndex 且 date 不帶時間時,iztro 取 0(早子時),不是呼叫當下的時辰。 */
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
 * 決定論:同 (astrolabe,date,timeIndex) 必同。流時需 timeIndex(0–11,子時起);
 *   不傳且 date 不帶時間時 iztro 取 0(早子時)。
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
  let { year, month, day } = toSolarYmd(req);
  let hour = req.hour;
  let correction: TrueSolarResult | undefined;

  if (req.trueSolar) {
    correction = toTrueSolarTime({
      year,
      month,
      day,
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

  // withOptions 的 config 只作用於這張盤(iztro ≥2.6.2 綁在盤上,含之後的 horoscope),
  // 不改全域設定,伺服器端多請求互不影響。不可改用 astro.config():那會改整個行程的預設。
  const astrolabe = astro.withOptions({
    type: 'solar',
    dateStr,
    timeIndex,
    gender: req.gender,
    fixLeap: true,
    language: iztroLang as Option['language'],
    config: { dayDivide: ZIWEI_DAY_DIVIDE },
  });

  return { astrolabe, timeIndex, correction };
}
