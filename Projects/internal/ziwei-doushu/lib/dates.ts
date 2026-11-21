import { Lunar } from 'lunar-javascript';
import type { Ymd } from './today';
import { FIXED_UTC8, dstHoursAt, utcOffsetAt, type BirthPlace } from './timezone';
import { toTrueSolarTime, type TrueSolarResult } from './trueSolarTime';

export type CalendarType = 'solar' | 'lunar';

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

/**
 * 晚子時(23 時)日界口徑,紫微與八字共用:
 * 'current' = 23 點仍算當天;'forward' = 23 點起算隔天。
 */
export type DayDivide = 'current' | 'forward';

/**
 * 晚子時預設口徑:全站唯一設定處(紫微 iztro dayDivide、八字 lunar-javascript sect 都由此推出)。
 * 取 current:《三命通會·論時刻》「若子時,則上半時在夜半前,屬昨日;下半時在夜半後,屬今日」,
 *   日以子正(0 時)為界。上游 iztro 預設是 forward。使用者可在表單逐盤改選(BirthInput.dayDivide)。
 * 放在本檔而非 lib/ziwei.ts:八字也要讀,不能為了一個常數把 iztro 拉進八字頁。
 */
export const DEFAULT_DAY_DIVIDE: DayDivide = 'current';

export interface YmdHm extends Ymd {
  hour: number;
  minute: number;
}

/** 八字、紫微共用的出生資料(BirthForm 的輸出)。 */
export interface BirthInput extends YmdHm {
  calendar: CalendarType;
  /** 農曆閏月 (僅 calendar=lunar 時有效) */
  isLeapMonth?: boolean;
  /** 出生地;不給 = 固定 UTC+8、無夏令時間、無經度(舊呼叫的口徑) */
  place?: BirthPlace;
  /** 以出生地經度做真太陽時校正(需有 place);否則日柱、時柱用當地標準時 */
  trueSolar?: boolean;
  /** 晚子時口徑;不給用 DEFAULT_DAY_DIVIDE */
  dayDivide?: DayDivide;
}

export interface ResolvedBirth {
  /** 當地鐘錶時間(國曆) */
  local: YmdHm;
  timeZone: string;
  /** 出生當下的 UTC 偏移(小時,含夏令時間) */
  utcOffsetHours: number;
  /** 出生當下實施夏令時間 */
  dst: boolean;
  /** 同一瞬間的北京時間(UTC+8):八字年柱、月柱、起運的節氣判定用(lunar-javascript 的節氣時刻是北京時間) */
  beijing: YmdHm;
  /** 定日柱、時柱與紫微時辰的時間:啟用真太陽時 = 真太陽時,否則 = 當地標準時(扣回夏令時間) */
  chart: YmdHm;
  correction?: TrueSolarResult;
}

function shiftMinutes(t: YmdHm, minutes: number): YmdHm {
  const d = new Date(Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute) + Math.round(minutes) * 60_000);
  return {
    year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
    hour: d.getUTCHours(), minute: d.getUTCMinutes(),
  };
}

/**
 * 出生資料的唯一入口:當地鐘錶時間 + 時區 + 經度 → 真太陽時與北京時間。
 * 八字、紫微(以及經由八字的每日運勢、合婚)都只從這裡取時間,不各自換算。
 */
export function resolveBirth(req: BirthInput): ResolvedBirth {
  const { year, month, day } = toSolarYmd(req);
  const local: YmdHm = { year, month, day, hour: req.hour, minute: req.minute };
  const { place } = req;
  if (place && !(Math.abs(place.lat) <= 90 && Math.abs(place.lon) <= 180)) {
    throw new Error(`經緯度超出範圍: ${place.lat}, ${place.lon}`);
  }
  if (req.trueSolar && !place) throw new Error('真太陽時校正需要出生地經度');
  // 時區名不存在時 Intl 拋 RangeError
  const timeZone = place?.zone ?? FIXED_UTC8;
  const utcOffsetHours = utcOffsetAt(timeZone, year, month, day, req.hour, req.minute);
  const dstHours = dstHoursAt(timeZone, year, month, day, req.hour, req.minute);
  const dst = dstHours > 0;
  const beijing = shiftMinutes(local, (8 - utcOffsetHours) * 60);

  // 未啟用真太陽時:用當地標準時(夏令時間撥快的那一小時扣回)
  let chart = shiftMinutes(local, -dstHours * 60);
  let correction: TrueSolarResult | undefined;
  if (req.trueSolar && place) {
    // 標準經線取「出生當下的實際偏移 × 15°」:夏令時間的那一小時在經度校正裡一併扣回。
    correction = toTrueSolarTime({ ...local, longitude: place.lon, tzOffsetHours: utcOffsetHours });
    chart = { year: correction.year, month: correction.month, day: correction.day, hour: correction.hour, minute: correction.minute };
  }
  return { local, timeZone, utcOffsetHours, dst, beijing, chart, correction };
}
