/**
 * 真太陽時校正 (True Solar Time correction)
 *
 * 多數免費紫微網站直接用「鐘錶時間」排盤，但傳統命理以「真太陽時」定時辰。
 * 鐘錶時間 = 時區標準經線的平均太陽時；真太陽時需兩項校正：
 *   1. 經度差校正：每偏離標準經線 1°，差 4 分鐘 (地球 24h 轉 360° => 1° = 4min)
 *   2. 均時差 (Equation of Time)：地球橢圓軌道 + 黃赤交角造成的視太陽與平太陽差
 *
 * 這是專業級準度差異 —— 出生在時辰交界(±15min)的人，校正後可能換宮。
 */

/** 一年中的第幾天 (1-366) */
function dayOfYear(year: number, month: number, day: number): number {
  const start = Date.UTC(year, 0, 0);
  const now = Date.UTC(year, month - 1, day);
  return Math.floor((now - start) / 86_400_000);
}

/**
 * 均時差 (分鐘)。正值表示視太陽快於平太陽。
 * 採用 NOAA 常用近似式，全年誤差 < 30 秒，足夠定時辰。
 */
export function equationOfTime(year: number, month: number, day: number): number {
  const n = dayOfYear(year, month, day);
  const b = (2 * Math.PI * (n - 81)) / 364;
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

export interface TrueSolarInput {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 出生地經度，東經為正 (台北 121.5、北京 116.4) */
  longitude: number;
  /** 時區相對 UTC 的小時偏移 (台北/北京 = 8) */
  tzOffsetHours: number;
}

export interface TrueSolarResult {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 校正總量 (分鐘)，方便 UI 顯示「校正了幾分鐘」 */
  correctionMinutes: number;
  longitudeCorrection: number;
  eotCorrection: number;
}

/**
 * 將鐘錶出生時間換算為真太陽時。可能跨日，故回傳完整年月日時分。
 */
export function toTrueSolarTime(input: TrueSolarInput): TrueSolarResult {
  const { year, month, day, hour, minute, longitude, tzOffsetHours } = input;
  const standardMeridian = tzOffsetHours * 15; // 時區標準經線
  const longitudeCorrection = (longitude - standardMeridian) * 4; // 分鐘
  const eotCorrection = equationOfTime(year, month, day); // 分鐘
  const correctionMinutes = longitudeCorrection + eotCorrection;

  // 用 UTC 基準的 Date 做分鐘加減，避免執行環境時區干擾，再讀回各欄位
  const base = new Date(Date.UTC(year, month - 1, day, hour, minute));
  base.setUTCMinutes(base.getUTCMinutes() + Math.round(correctionMinutes));

  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
    hour: base.getUTCHours(),
    minute: base.getUTCMinutes(),
    correctionMinutes: Math.round(correctionMinutes * 10) / 10,
    longitudeCorrection: Math.round(longitudeCorrection * 10) / 10,
    eotCorrection: Math.round(eotCorrection * 10) / 10,
  };
}

/**
 * 小時 (0-23) 轉 iztro 時辰索引 (0-12)。
 * iztro: 0=早子(00時) 1=丑 2=寅 3=卯 4=辰 5=巳 6=午 7=未 8=申 9=酉 10=戌 11=亥 12=晚子(23時)
 */
export function hourToTimeIndex(hour: number): number {
  if (hour === 23) return 12; // 晚子時
  if (hour === 0) return 0; // 早子時
  return Math.floor((hour + 1) / 2);
}
