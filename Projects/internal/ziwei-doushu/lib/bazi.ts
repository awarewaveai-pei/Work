import { LunarUtil, Solar, type EightChar } from 'lunar-javascript';
import type { TrueSolarResult } from './trueSolarTime';
import { defaultLocale, type Locale } from './i18n/config';
import { analyzeBazi, type Strength } from './baziAnalysis';
import type { WuXing } from './ganzhi';
import type { Gender } from './ziwei';
import { findBaziRelations, type BaziRelation, type PillarChars } from './baziRelations';
import { liChunYear, yearGanZhi } from './liChun';
import { findShensha, type ShenshaHit } from './baziShensha';
import { localize } from './s2t';
import { DEFAULT_DAY_DIVIDE, resolveBirth, type BirthInput, type YmdHm } from './dates';
import { localToday } from './today';

/**
 * 八字四柱排盤 (lunar-javascript)。
 *
 * 注意:lunar-javascript 僅輸出簡體中文且無 i18n。本模組將高頻可見詞(十神/生肖)
 *   正規化到顯示 locale(十神/生肖/十二長生/納音逐字轉繁,表在 lib/s2t.ts);干支/藏干/五行為繁簡共形。英文使用者
 *   的「解讀」由 AI 層依 locale 產生(命盤資料本身為命理通用記法)。
 * 時間一律經 lib/dates.ts resolveBirth:年柱、月柱、起運看同一瞬間的北京時間(節氣時刻是北京時間);
 *   日柱、時柱看真太陽時(未啟用則當地鐘錶時間)。
 */
export interface BaziRequest extends BirthInput {
  gender: Gender;
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
  /** 出生地時區與出生當下的 UTC 偏移(dst = 當時實施夏令時間,已校正) */
  zone: { timeZone: string; utcOffsetHours: number; dst: boolean };
}

const LUCK_STEPS = 8;

function eightCharAt(t: YmdHm): EightChar {
  return Solar.fromYmdHms(t.year, t.month, t.day, t.hour, t.minute, 0).getLunar().getEightChar();
}

interface RawPillar {
  ganZhi: string;
  gan: string;
  zhi: string;
  shiShen: string;
  /** 地支藏干的十神(同 lunar-javascript getXxxShiShenZhi) */
  hidden: string[];
  naYin: string;
  diShi: string;
}

/**
 * 年柱、月柱與日柱可能來自不同瞬間(北京時間 vs 真太陽時),十神與十二長生要對日柱的日干重算。
 * 查表同 lunar-javascript EightChar 的 getYearShiShenZhi、_getDiShi(lunar.js)。
 */
function pillarAgainstDay(dayGan: string, dayGanIndex: number, gan: string, zhi: string): RawPillar {
  const zhiIndex = LunarUtil.ZHI.indexOf(zhi) - 1;
  const i = LunarUtil.CHANG_SHENG_OFFSET[dayGan] + (dayGanIndex % 2 === 0 ? zhiIndex : -zhiIndex);
  return {
    ganZhi: gan + zhi,
    gan,
    zhi,
    shiShen: LunarUtil.SHI_SHEN[dayGan + gan],
    hidden: LunarUtil.ZHI_HIDE_GAN[zhi].map((h) => LunarUtil.SHI_SHEN[dayGan + h]),
    naYin: LunarUtil.NAYIN[gan + zhi],
    diShi: LunarUtil.CHANG_SHENG[((i % 12) + 12) % 12],
  };
}

/** 基準日的流年:立春前仍屬前一年。 */
function liuNianOf(d: { year: number; month: number; day: number }): BaziLuck['liuNian'] {
  const year = liChunYear(d.year, d.month, d.day);
  return { year, ganZhi: yearGanZhi(year) };
}

/** 月令本氣十神 → 格局名(比肩/劫財 為特殊格)。 */
function patternName(rawShiShen: string, locale: Locale): string {
  const tw = localize(rawShiShen, locale);
  if (tw === '比肩') return '建祿格';
  if (tw === '劫財') return '陽刃格';
  return `${tw}格`;
}

export function computeBazi(req: BaziRequest): BaziResult {
  const locale = req.locale ?? defaultLocale;
  const birth = resolveBirth(req);

  // 日柱、時柱:真太陽時(或當地鐘錶時間);晚子時口徑 dayDivide → lunar sect(1 = 隔天、2 = 當天)
  const ec = eightCharAt(birth.chart);
  ec.setSect((req.dayDivide ?? DEFAULT_DAY_DIVIDE) === 'forward' ? 1 : 2);
  // 年柱、月柱、起運、生肖:同一瞬間的北京時間,與 lunar-javascript 的節氣時刻同一時區
  const { beijing } = birth;
  const lunar = Solar.fromYmdHms(beijing.year, beijing.month, beijing.day, beijing.hour, beijing.minute, 0).getLunar();
  const ecJie = lunar.getEightChar();
  const dayGan = ec.getDayGan();
  const yearRaw = pillarAgainstDay(dayGan, ec.getDayGanIndex(), ecJie.getYearGan(), ecJie.getYearZhi());
  const monthRaw = pillarAgainstDay(dayGan, ec.getDayGanIndex(), ecJie.getMonthGan(), ecJie.getMonthZhi());

  const pillar = (p: RawPillar): BaziPillar => ({
    gan: p.gan,
    zhi: p.zhi,
    ganZhi: p.ganZhi,
    shiShen: localize(p.shiShen, locale),
    hiddenStems: p.hidden.map((h) => localize(h, locale)),
    naYin: localize(p.naYin, locale),
    diShi: localize(p.diShi, locale),
  });
  const dayRaw: RawPillar = {
    ganZhi: ec.getDay(), gan: ec.getDayGan(), zhi: ec.getDayZhi(), shiShen: '日主',
    hidden: ec.getDayShiShenZhi(), naYin: ec.getDayNaYin(), diShi: ec.getDayDiShi(),
  };
  const hourRaw: RawPillar = {
    ganZhi: ec.getTime(), gan: ec.getTimeGan(), zhi: ec.getTimeZhi(), shiShen: ec.getTimeShiShenGan(),
    hidden: ec.getTimeShiShenZhi(), naYin: ec.getTimeNaYin(), diShi: ec.getTimeDiShi(),
  };

  // 大運:lunar-javascript 依節氣精算起運(3 日折 1 年);索引 0 為起運前小運,不列。
  const yun = ecJie.getYun(req.gender === '男' ? 1 : 0);
  const steps: BaziLuckStep[] = yun.getDaYun(LUCK_STEPS + 1).slice(1).map((d) => ({
    ganZhi: d.getGanZhi(),
    startAge: d.getStartAge(),
    endAge: d.getEndAge(),
    startYear: d.getStartYear(),
    endYear: d.getEndYear(),
  }));
  const liuNian = liuNianOf(req.asOf ?? localToday());
  const current = steps.findIndex((s) => s.startYear <= liuNian.year && liuNian.year <= s.endYear);

  const chars: PillarChars = {
    gan: { year: yearRaw.gan, month: monthRaw.gan, day: dayRaw.gan, hour: hourRaw.gan },
    zhi: { year: yearRaw.zhi, month: monthRaw.zhi, day: dayRaw.zhi, hour: hourRaw.zhi },
  };

  // 喜用神 / 格局:用 lunar 算好的「原始(簡體)十神」分析,與排盤同源。
  //   地支取「本氣」(藏干十神陣列首位)。月令權重在 analyzeBazi 內加倍。
  const analysisRaw = analyzeBazi({
    dayGan,
    stemShiShen: [yearRaw.shiShen, monthRaw.shiShen, hourRaw.shiShen],
    branchPrimaryShiShen: [
      { shiShen: yearRaw.hidden[0], isMonth: false },
      { shiShen: monthRaw.hidden[0], isMonth: true },
      { shiShen: dayRaw.hidden[0], isMonth: false },
      { shiShen: hourRaw.hidden[0], isMonth: false },
    ],
    monthPrimaryShiShen: monthRaw.hidden[0],
  });

  return {
    pillars: {
      year: pillar(yearRaw),
      month: pillar(monthRaw),
      day: pillar(dayRaw),
      hour: pillar(hourRaw),
    },
    dayMaster: dayGan,
    zodiac: localize(lunar.getYearShengXiao(), locale),
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
    correction: birth.correction,
    zone: { timeZone: birth.timeZone, utcOffsetHours: birth.utcOffsetHours, dst: birth.dst },
  };
}
