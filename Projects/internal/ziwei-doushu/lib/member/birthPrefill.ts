import { toSolarYmd } from '@/lib/dates';
import { isRealDate } from '@/lib/divination/input';
import { BIRTH_FIELDS, birthDateErrors } from '@/lib/divination/fields';
import { parseInput } from '@/lib/divination/input';
import type { BirthPlace } from '@/lib/timezone';
import type { CalendarType, Gender } from '@/lib/ziwei';
import type { DayDivide } from '@/lib/dates';
import type { FrameWindow } from '@/lib/ai/memberRequest';

/**
 * 會員自己的出生資料 → 工具表單的初始值(純函式,node 測試可跑;components/BirthForm.tsx、AstrologyTool、VedicTool 用)。
 * 來源:WordPress 同網域父頁腳本(oracle-wp-plugin assets/embed-same-origin.js,0.5.4)替登入會員定義
 *   window.awOracleBirth(),回 Promise<BIRTH_FIELDS | null>。寫法同 lib/ai/memberRequest.ts 的取票:
 *   只認 window.parent 且同源,不收 postMessage;不在框內、跨源、沒定義、丟錯、逾時 → null。
 * 父頁腳本在頁尾載入,框內頁可能比它先跑:第一次找不到函式就等 RETRY_MS 再找一次。
 * 信任邊界:父頁給的是資料,一律用引擎自己的 BIRTH_FIELDS 規格(parseInput,與 API 同一套)＋日期是否存在
 *   驗過才用;不合格 = 當作沒有,表單維持原本的預設值。
 */
export const BIRTH_TIMEOUT_MS = 3000;
export const BIRTH_RETRY_MS = 1500;

export interface StoredBirth {
  calendar: CalendarType;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  isLeapMonth: boolean;
  gender: Gender;
  place: BirthPlace;
  trueSolar: boolean;
  dayDivide: DayDivide;
}

type BirthFn = () => unknown;

/** 同源父頁的 awOracleBirth;不在框內、跨源、未定義 → null(跨源時連讀屬性都不做第二次)。 */
export function parentBirthFn(win: FrameWindow): BirthFn | null {
  const parent = win.parent as (FrameWindow & { awOracleBirth?: unknown }) | null | undefined;
  if (!parent || parent === (win as unknown)) return null;
  try {
    if (parent.location.origin !== win.location.origin) return null;
    const fn = parent.awOracleBirth;
    return typeof fn === 'function' ? () => (fn as BirthFn).call(parent) : null;
  } catch {
    return null;
  }
}

/** 父頁給的值 → 驗證過的出生資料;任何一處不合格 → null。null 值當作沒給(選填欄位用預設)。 */
export function validStoredBirth(v: unknown): StoredBirth | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const clean: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (val !== null) clean[k] = val;
  const r = parseInput(
    { fields: BIRTH_FIELDS, check: (b) => birthDateErrors(b), build: (b) => b, example: {} },
    clean,
  );
  if (!r.ok) return null;
  const b = r.value;
  const p = b.place as Record<string, unknown>;
  const zone = p.zone as string;
  return {
    calendar: b.calendar as CalendarType,
    year: b.year as number,
    month: b.month as number,
    day: b.day as number,
    hour: b.hour as number,
    minute: b.minute as number,
    isLeapMonth: b.calendar === 'lunar' && b.isLeapMonth === true,
    gender: b.gender as Gender,
    place: { label: typeof p.label === 'string' && p.label !== '' ? p.label : zone, lat: p.lat as number, lon: p.lon as number, zone },
    trueSolar: b.trueSolar === true,
    dayDivide: b.dayDivide === 'forward' ? 'forward' : 'current',
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 向同源父頁要會員的出生資料;拿不到或不合格 → null。 */
export async function readParentBirth(
  win: FrameWindow,
  { timeoutMs = BIRTH_TIMEOUT_MS, retryMs = BIRTH_RETRY_MS }: { timeoutMs?: number; retryMs?: number } = {},
): Promise<StoredBirth | null> {
  let fn = parentBirthFn(win);
  if (!fn && retryMs > 0 && isSameOriginFrame(win)) {
    await sleep(retryMs);
    fn = parentBirthFn(win);
  }
  if (!fn) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    return validStoredBirth(await Promise.race([Promise.resolve().then(fn), timeout]));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 在同源框內(值得等父頁腳本載入);獨立頁與跨源框不等。 */
function isSameOriginFrame(win: FrameWindow): boolean {
  const parent = win.parent as FrameWindow | null | undefined;
  if (!parent || parent === (win as unknown)) return false;
  try {
    return parent.location.origin === win.location.origin;
  } catch {
    return false;
  }
}

/**
 * 預填只發生一次,且只在使用者還沒動過任何欄位時:讀到合格資料、isTouched() 仍為 false → apply。
 * apply 回 false = 這個工具用不了這筆(如西洋占星的年份範圍),表單不動。
 * 回傳是否真的帶入(元件據此顯示「已帶入」提示)。
 */
export async function prefillOnce(
  read: () => Promise<StoredBirth | null>,
  isTouched: () => boolean,
  apply: (b: StoredBirth) => boolean | void,
): Promise<boolean> {
  const b = await read();
  if (!b || isTouched()) return false;
  return apply(b) !== false;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** 出生資料 → 表單用的日期／時間字串(YYYY-MM-DD、HH:MM;日期照原曆法)。 */
export const dateText = (b: Pick<StoredBirth, 'year' | 'month' | 'day'>) => `${pad(b.year, 4)}-${pad(b.month)}-${pad(b.day)}`;
export const timeText = (b: Pick<StoredBirth, 'hour' | 'minute'>) => `${pad(b.hour)}:${pad(b.minute)}`;

/**
 * 給 <input type="date"> 的出生資料:農曆日期若不是存在的國曆日(如農曆二月三十),日期框放不進去,
 * 改用同一天的國曆日期與 solar 曆法(命盤相同);其餘照原曆法。
 */
export function forDateInput(b: StoredBirth): StoredBirth {
  if (b.calendar !== 'lunar' || isRealDate(b.year, b.month, b.day)) return b;
  const s = toSolarYmd({ year: b.year, month: b.month, day: b.day, calendar: 'lunar', isLeapMonth: b.isLeapMonth });
  return { ...b, ...s, calendar: 'solar', isLeapMonth: false };
}

/** 只收國曆的工具(西洋占星、吠陀):農曆換成國曆日期。 */
export function solarDateText(b: StoredBirth): string {
  return dateText(toSolarYmd({ year: b.year, month: b.month, day: b.day, calendar: b.calendar, isLeapMonth: b.isLeapMonth }));
}
