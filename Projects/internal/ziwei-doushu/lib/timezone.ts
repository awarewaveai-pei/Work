/**
 * 出生地時區 → 出生當下的實際 UTC 偏移(含歷史夏令時間)。
 *
 * 只用平台內建的 Intl(IANA 時區資料庫,Node 與瀏覽器都附),不加依賴。
 * 偏移以小時表示,可為小數(如印度 +5.5)。
 */

/**
 * 出生地:任何地點皆可,不假設亞洲。zone = IANA 時區名;lat/lon = 十進位度數(北緯、東經為正)。
 * 目前只有 lon(真太陽時)與 zone(UTC 偏移)參與計算;lat 留給占星等需要緯度的系統。
 */
export interface BirthPlace {
  label: string;
  lat: number;
  lon: number;
  zone: string;
}

/** 舊行為的固定 UTC+8、無夏令時間(IANA 的 Etc 時區符號與一般相反:Etc/GMT-8 = UTC+8)。 */
export const FIXED_UTC8 = 'Etc/GMT-8';

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    // 時區名不存在時這裡拋 RangeError,呼叫端的「計算失敗」會接住。
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' });
    formatters.set(zone, f);
  }
  return f;
}

/** 某個 UTC 瞬間在該時區的偏移(小時)。 */
export function offsetAtInstant(zone: string, utcMs: number): number {
  const name = formatterFor(zone)
    .formatToParts(new Date(utcMs))
    .find((p) => p.type === 'timeZoneName')?.value;
  // 形如 "GMT+09:00"、"GMT-04:00";UTC 本身為 "GMT";標準時制定前的地方平時帶秒,如 "GMT+08:05:43"
  const m = /^GMT(?:([+-])(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(name ?? '');
  if (!m) throw new Error(`無法解析時區偏移: ${zone} ${name}`);
  if (!m[1]) return 0;
  const h = Number(m[2]) + Number(m[3]) / 60 + Number(m[4] ?? 0) / 3600;
  return m[1] === '-' ? -h : h;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * 當地鐘錶時間 → 該時刻的 UTC 偏移(小時)。
 * - 重疊(撥回一小時,同一個鐘錶時間出現兩次):取較早的那一次,即夏令時間的偏移。
 * - 跳空(撥快一小時,該鐘錶時間不存在):取撥快前的偏移,等同把鐘錶時間往後推一小時。
 */
export function utcOffsetAt(zone: string, y: number, m: number, d: number, h: number, min: number): number {
  const wall = Date.UTC(y, m - 1, d, h, min);
  const candidates = [...new Set([
    offsetAtInstant(zone, wall - DAY),
    offsetAtInstant(zone, wall),
    offsetAtInstant(zone, wall + DAY),
  ])];
  // 偏移 o 成立 = 以 o 換回的 UTC 瞬間,在該時區讀出的偏移仍是 o。
  const valid = candidates.filter((o) => offsetAtInstant(zone, wall - o * HOUR) === o);
  if (valid.length > 0) return Math.max(...valid); // 偏移較大 = UTC 瞬間較早
  return offsetAtInstant(zone, wall - DAY);
}

const HALF_YEAR = 182 * DAY;

/**
 * 出生當下夏令時間撥快了幾小時(未實施為 0)。
 * 夏令時間是暫時撥快、之後會撥回:出生時偏移同時大於約半年前與半年後的偏移,差額才算夏令時間。
 * 永久改時區(如莫斯科 2011、2014,平壤 2015、2018,加拉加斯 2007)前後偏移不會都比較小,不會被誤判。
 * 已知限制:英國 1941–45 雙重夏令時間(+2)只認得多出的 1 小時(冬天本身也撥快)。
 */
export function dstHoursAt(zone: string, y: number, m: number, d: number, h: number, min: number): number {
  const offset = utcOffsetAt(zone, y, m, d, h, min);
  const utc = Date.UTC(y, m - 1, d, h, min) - offset * HOUR;
  const around = Math.max(offsetAtInstant(zone, utc - HALF_YEAR), offsetAtInstant(zone, utc + HALF_YEAR));
  return offset > around ? offset - around : 0;
}

/** 該時刻是否實施夏令時間。 */
export function isDstAt(zone: string, y: number, m: number, d: number, h: number, min: number): boolean {
  return dstHoursAt(zone, y, m, d, h, min) > 0;
}
