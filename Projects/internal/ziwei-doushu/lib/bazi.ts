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
import { findBaziRelations, type BaziRelation, type PillarChars } from './baziRelations';
import { findShensha, type ShenshaHit } from './baziShensha';

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
  /** 流年／目前大運的基準日(國曆),預設今天;測試注入固定日期。 */
  asOf?: { year: number; month: number; day: number };
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
  /** 十二長生(日干臨該柱地支) */
  diShi: string;
}

/** 一步大運。年齡為虛歲(lunar-javascript 口徑)。 */
export interface BaziLuckStep {
  ganZhi: string;
  startAge: number;
  endAge: number;
  startYear: number;
  endYear: number;
}

export interface BaziLuck {
  /** 順排(陽男陰女)/ 逆排 */
  forward: boolean;
  /** 起運:出生後幾年幾月幾日交運 */
  start: { years: number; months: number; days: number };
  /** 八步大運 */
  steps: BaziLuckStep[];
  /** 流年所在大運在 steps 的索引;尚未起運或已過八步為 null */
  currentIndex: number | null;
  /** 流年(以立春換年) */
  liuNian: { year: number; ganZhi: string };
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
  luck: BaziLuck;
  /** 日柱空亡(兩地支) */
  xunKong: string;
  /** 原局干支合沖刑害 */
  relations: BaziRelation[];
  /** 原局神煞 */
  shensha: ShenshaHit[];
  correction?: TrueSolarResult;
}

// 簡 → 繁 正規化(僅列繁簡相異者;其餘 passthrough)
const SHISHEN_TW: Record<string, string> = {
  劫财: '劫財', 伤官: '傷官', 偏财: '偏財', 正财: '正財', 七杀: '七殺',
};
const ZODIAC_TW: Record<string, string> = {
  龙: '龍', 马: '馬', 鸡: '雞', 猪: '豬',
};

// lunar-javascript 十二長生為簡體
const DISHI_TW: Record<string, string> = {
  长生: '長生', 冠带: '冠帶', 临官: '臨官', 养: '養', 绝: '絕',
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

const LUCK_STEPS = 8;

/** 基準日的流年:立春前仍屬前一年。 */
function liuNianOf(d: { year: number; month: number; day: number }): BaziLuck['liuNian'] {
  const ganZhi = Solar.fromYmd(d.year, d.month, d.day).getLunar().getYearInGanZhiByLiChun();
  // 年中(6/1)必在立春與春節之後,其年干支即該國曆年的干支
  const sameYear = Solar.fromYmd(d.year, 6, 1).getLunar().getYearInGanZhi() === ganZhi;
  return { year: sameYear ? d.year : d.year - 1, ganZhi };
}

function todayYmd(): { year: number; month: number; day: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
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
    diShi: string,
  ): BaziPillar => ({
    gan,
    zhi,
    ganZhi,
    shiShen: localizeShiShen(shiShen, locale),
    hiddenStems: hidden.map((h) => localizeShiShen(h, locale)),
    naYin,
    diShi: isSimplified(locale) ? diShi : toTW(diShi, DISHI_TW),
  });

  // 大運:lunar-javascript 依節氣精算起運(3 日折 1 年);索引 0 為起運前小運,不列。
  const yun = ec.getYun(req.gender === '男' ? 1 : 0);
  const steps: BaziLuckStep[] = yun.getDaYun(LUCK_STEPS + 1).slice(1).map((d) => ({
    ganZhi: d.getGanZhi(),
    startAge: d.getStartAge(),
    endAge: d.getEndAge(),
    startYear: d.getStartYear(),
    endYear: d.getEndYear(),
  }));
  const liuNian = liuNianOf(req.asOf ?? todayYmd());
  const current = steps.findIndex((s) => s.startYear <= liuNian.year && liuNian.year <= s.endYear);

  const chars: PillarChars = {
    gan: { year: ec.getYearGan(), month: ec.getMonthGan(), day: ec.getDayGan(), hour: ec.getTimeGan() },
    zhi: { year: ec.getYearZhi(), month: ec.getMonthZhi(), day: ec.getDayZhi(), hour: ec.getTimeZhi() },
  };

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
      year: pillar(ec.getYear(), ec.getYearGan(), ec.getYearZhi(), ec.getYearShiShenGan(), ec.getYearShiShenZhi(), ec.getYearNaYin(), ec.getYearDiShi()),
      month: pillar(ec.getMonth(), ec.getMonthGan(), ec.getMonthZhi(), ec.getMonthShiShenGan(), ec.getMonthShiShenZhi(), ec.getMonthNaYin(), ec.getMonthDiShi()),
      day: pillar(ec.getDay(), ec.getDayGan(), ec.getDayZhi(), '日主', ec.getDayShiShenZhi(), ec.getDayNaYin(), ec.getDayDiShi()),
      hour: pillar(ec.getTime(), ec.getTimeGan(), ec.getTimeZhi(), ec.getTimeShiShenGan(), ec.getTimeShiShenZhi(), ec.getTimeNaYin(), ec.getTimeDiShi()),
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
    luck: {
      forward: yun.isForward(),
      start: { years: yun.getStartYear(), months: yun.getStartMonth(), days: yun.getStartDay() },
      steps,
      currentIndex: current >= 0 ? current : null,
      liuNian,
    },
    xunKong: ec.getDayXunKong(),
    relations: findBaziRelations(chars),
    shensha: findShensha(chars),
    correction,
  };
}
