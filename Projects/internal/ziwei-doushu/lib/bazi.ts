import { Solar } from 'lunar-javascript';
import {
  toTrueSolarTime,
  type TrueSolarResult,
} from './trueSolarTime';
import { defaultLocale, type Locale } from './i18n/config';
import {
  analyzeBazi,
  type Strength,
  type WuXing,
} from './baziAnalysis';
import type { Gender, CalendarType } from './ziwei';

/**
 * 八字四柱排盤 (lunar-javascript)。
 *
 * 注意:lunar-javascript 僅輸出簡體中文且無 i18n。本模組將高頻可見詞(十神/生肖)
 *   正規化到顯示 locale;干支/藏干/五行為繁簡共形,納音 passthrough。英文使用者
 *   的「解讀」由 AI 層依 locale 產生(命盤資料本身為命理通用記法)。
 * 時柱採真太陽時校正(與紫微同一套 trueSolarTime,準度核心)。
 */
export interface BaziRequest {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  gender: Gender;
  calendar: CalendarType;
  isLeapMonth?: boolean;
  trueSolar?: { longitude: number; tzOffsetHours: number };
  locale?: Locale;
}

export interface BaziPillar {
  gan: string;
  zhi: string;
  ganZhi: string;
  /** 十神(日柱為「日主」) */
  shiShen: string;
  /** 地支藏干 */
  hiddenStems: string[];
  naYin: string;
}

/** 喜用神 / 格局分析結果(扶抑法,見 baziAnalysis.ts;pattern 已在地化)。 */
export interface BaziAnalysisDisplay {
  strength: Strength;
  dayElement: WuXing;
  /** 喜用神(五行) */
  favorable: WuXing[];
  /** 忌神(五行) */
  avoid: WuXing[];
  /** 格局名,如「偏財格」 */
  pattern: string;
}

export interface BaziResult {
  pillars: { year: BaziPillar; month: BaziPillar; day: BaziPillar; hour: BaziPillar };
  dayMaster: string;
  zodiac: string;
  analysis: BaziAnalysisDisplay;
  correction?: TrueSolarResult;
}

// 簡 → 繁 正規化(僅列繁簡相異者;其餘 passthrough)
const SHISHEN_TW: Record<string, string> = {
  劫财: '劫財', 伤官: '傷官', 偏财: '偏財', 正财: '正財', 七杀: '七殺',
};
const ZODIAC_TW: Record<string, string> = {
  龙: '龍', 马: '馬', 鸡: '雞', 猪: '豬',
};

function toTW(value: string, map: Record<string, string>): string {
  return map[value] ?? value;
}

// zh-CN(尚未上線,未來加入時)passthrough 簡體;其餘正規化為繁中。
// cast 以容納未來新增的 locale,避免目前 union 不含 zh-CN 的型別誤判。
function isSimplified(locale: Locale): boolean {
  return (locale as string).startsWith('zh-CN');
}

function localizeShiShen(value: string, locale: Locale): string {
  return isSimplified(locale) ? value : toTW(value, SHISHEN_TW);
}
function localizeZodiac(value: string, locale: Locale): string {
  return isSimplified(locale) ? value : toTW(value, ZODIAC_TW);
}

/** 月令本氣十神 → 格局名(比肩/劫財 為特殊格)。 */
function patternName(rawShiShen: string, locale: Locale): string {
  const tw = localizeShiShen(rawShiShen, locale);
  if (tw === '比肩') return '建祿格';
  if (tw === '劫財') return '陽刃格';
  return `${tw}格`;
}

export function computeBazi(req: BaziRequest): BaziResult {
  const locale = req.locale ?? defaultLocale;
  let { year, month, day, hour, minute } = req;
  let correction: TrueSolarResult | undefined;

  if (req.trueSolar) {
    correction = toTrueSolarTime({
      year, month, day, hour, minute,
      longitude: req.trueSolar.longitude,
      tzOffsetHours: req.trueSolar.tzOffsetHours,
    });
    ({ year, month, day, hour, minute } = correction);
  }

  // 八字以節氣立年/月,農曆輸入先轉國曆再排(lunar-javascript 由國曆推八字)
  const solar = Solar.fromYmdHms(year, month, day, hour, minute, 0);
  const lunar = solar.getLunar();
  const ec = lunar.getEightChar();

  const pillar = (
    ganZhi: string,
    gan: string,
    zhi: string,
    shiShen: string,
    hidden: string[],
    naYin: string,
  ): BaziPillar => ({
    gan,
    zhi,
    ganZhi,
    shiShen: localizeShiShen(shiShen, locale),
    hiddenStems: hidden.map((h) => localizeShiShen(h, locale)),
    naYin,
  });

  // 喜用神 / 格局:用 lunar 算好的「原始(簡體)十神」分析,與排盤同源。
  //   地支取「本氣」(藏干十神陣列首位)。月令權重在 analyzeBazi 內加倍。
  const analysisRaw = analyzeBazi({
    dayGan: ec.getDayGan(),
    stemShiShen: [
      ec.getYearShiShenGan(),
      ec.getMonthShiShenGan(),
      ec.getTimeShiShenGan(),
    ],
    branchPrimaryShiShen: [
      { shiShen: ec.getYearShiShenZhi()[0], isMonth: false },
      { shiShen: ec.getMonthShiShenZhi()[0], isMonth: true },
      { shiShen: ec.getDayShiShenZhi()[0], isMonth: false },
      { shiShen: ec.getTimeShiShenZhi()[0], isMonth: false },
    ],
    monthPrimaryShiShen: ec.getMonthShiShenZhi()[0],
  });

  return {
    pillars: {
      year: pillar(ec.getYear(), ec.getYearGan(), ec.getYearZhi(), ec.getYearShiShenGan(), ec.getYearShiShenZhi(), ec.getYearNaYin()),
      month: pillar(ec.getMonth(), ec.getMonthGan(), ec.getMonthZhi(), ec.getMonthShiShenGan(), ec.getMonthShiShenZhi(), ec.getMonthNaYin()),
      day: pillar(ec.getDay(), ec.getDayGan(), ec.getDayZhi(), '日主', ec.getDayShiShenZhi(), ec.getDayNaYin()),
      hour: pillar(ec.getTime(), ec.getTimeGan(), ec.getTimeZhi(), ec.getTimeShiShenGan(), ec.getTimeShiShenZhi(), ec.getTimeNaYin()),
    },
    dayMaster: ec.getDayGan(),
    zodiac: localizeZodiac(lunar.getYearShengXiao(), locale),
    analysis: {
      strength: analysisRaw.strength,
      dayElement: analysisRaw.dayElement,
      favorable: analysisRaw.favorable,
      avoid: analysisRaw.avoid,
      pattern: patternName(analysisRaw.patternShiShen, locale),
    },
    correction,
  };
}
