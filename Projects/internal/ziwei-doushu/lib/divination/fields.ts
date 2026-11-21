import type { BirthInput } from '@/lib/dates';
import { toSolarYmd } from '@/lib/dates';
import type { Gender } from '@/lib/ziwei';
import type { WesternRequest } from '@/lib/astrology';
import { utcOffsetAt, type BirthPlace } from '@/lib/timezone';
import type { Ymd } from '@/lib/today';
import { isRealDate, YEAR_MAX, YEAR_MIN, type FieldSpec, type Fields, type InputSpec } from './input';

/**
 * 各系統共用的輸入欄位(只宣告一次)。出生資料沿用 E5 口徑:當地鐘錶時間 + BirthPlace(IANA 時區、經緯度由呼叫端給)。
 */

const t = (zh: string, en: string) => ({ 'zh-TW': zh, en });

export const PLACE_FIELD: FieldSpec = {
  type: 'object',
  doc: t('出生地', 'Birthplace'),
  fields: {
    label: { type: 'string', maxLength: 100, required: false, doc: t('地名(只供顯示)', 'Place name (display only)') },
    lat: { type: 'number', min: -90, max: 90, doc: t('緯度,北為正', 'Latitude, north positive') },
    lon: { type: 'number', min: -180, max: 180, doc: t('經度,東為正', 'Longitude, east positive') },
    zone: { type: 'timeZone', doc: t('IANA 時區名,如 Asia/Taipei、Europe/Paris;歷史夏令時間自動判定', 'IANA time zone such as Asia/Taipei or Europe/Paris; historical daylight saving time is applied automatically') },
  },
};

export const GENDER_FIELD: FieldSpec = {
  type: 'enum',
  values: ['男', '女'],
  doc: t('性別:男 / 女', 'Gender: 男 = male, 女 = female'),
};

export const DATE = (zh: string, en: string, required = true): FieldSpec => ({ type: 'date', doc: t(zh, en), required });

const CLOCK: Fields = {
  hour: { type: 'integer', min: 0, max: 23, doc: t('出生時(當地鐘錶時間)', 'Birth hour (local clock time)') },
  minute: { type: 'integer', min: 0, max: 59, doc: t('出生分', 'Birth minute') },
};

/** 八字、紫微、每日運勢、合婚共用的出生資料。 */
export const BIRTH_FIELDS: Fields = {
  calendar: { type: 'enum', values: ['solar', 'lunar'], doc: t('曆法:solar 國曆 / lunar 農曆', 'Calendar: solar (Gregorian) or lunar (Chinese)') },
  year: { type: 'integer', min: YEAR_MIN, max: YEAR_MAX, doc: t('出生年', 'Birth year') },
  month: { type: 'integer', min: 1, max: 12, doc: t('出生月', 'Birth month') },
  day: { type: 'integer', min: 1, max: 31, doc: t('出生日(農曆最多 30)', 'Birth day (lunar months have at most 30)') },
  ...CLOCK,
  isLeapMonth: { type: 'boolean', required: false, doc: t('農曆閏月', 'Lunar leap month') },
  gender: GENDER_FIELD,
  place: PLACE_FIELD,
  trueSolar: { type: 'boolean', required: false, doc: t('以出生地經度做真太陽時校正(預設 false)', 'Apply true solar time from the birthplace longitude (default false)') },
  dayDivide: {
    type: 'enum',
    values: ['current', 'forward'],
    required: false,
    doc: t('晚子時(23 時):current 仍算當天(預設)/ forward 算隔天', 'Late Rat hour (23:00): current = same day (default), forward = next day'),
  },
};

/** 出生日期是否存在(國曆或農曆含閏月);path 為欄位前綴。 */
export function birthDateErrors(v: Record<string, unknown>, path = ''): string[] {
  const at = path ? `${path}.` : '';
  const ymd = { year: v.year as number, month: v.month as number, day: v.day as number };
  if (v.calendar === 'lunar') {
    try {
      toSolarYmd({ ...ymd, calendar: 'lunar', isLeapMonth: v.isLeapMonth === true });
      return [];
    } catch {
      return [`${at}day: no such lunar date`];
    }
  }
  return isRealDate(ymd.year, ymd.month, ymd.day) ? [] : [`${at}day: no such date`];
}

export function toPlace(v: unknown): BirthPlace {
  const p = v as Record<string, unknown>;
  const zone = p.zone as string;
  return { label: (p.label as string | undefined) ?? zone, lat: p.lat as number, lon: p.lon as number, zone };
}

export function toBirth(v: Record<string, unknown>): BirthInput & { gender: Gender } {
  return {
    calendar: v.calendar as BirthInput['calendar'],
    year: v.year as number,
    month: v.month as number,
    day: v.day as number,
    hour: v.hour as number,
    minute: v.minute as number,
    isLeapMonth: v.isLeapMonth === true,
    gender: v.gender as Gender,
    place: toPlace(v.place),
    trueSolar: v.trueSolar === true,
    dayDivide: v.dayDivide as BirthInput['dayDivide'],
  };
}

export const toYmd = (v: unknown): Ymd => {
  const d = v as Record<string, number>;
  return { year: d.year, month: d.month, day: d.day };
};

/**
 * XALEN 星曆(西洋占星的本命、行運、合盤)只涵蓋 1900–2099 年;超出時 computeWesternChart 丟
 *   「epoch JD … outside coverage」。吠陀只取恆星黃道位置,1800–2200 都算得出,用一般範圍。
 */
export const XALEN_YEAR_MIN = 1900;
export const XALEN_YEAR_MAX = 2099;
const XALEN_YEAR: FieldSpec = { type: 'integer', min: XALEN_YEAR_MIN, max: XALEN_YEAR_MAX, doc: t('出生年(1900–2099,星曆涵蓋範圍)', 'Birth year (1900–2099, the ephemeris range)') };

/** 吠陀的出生資料(國曆)。 */
export const WESTERN_BIRTH_FIELDS: Fields = {
  year: BIRTH_FIELDS.year,
  month: BIRTH_FIELDS.month,
  day: { type: 'integer', min: 1, max: 31, doc: t('出生日', 'Birth day') },
  ...CLOCK,
  place: PLACE_FIELD,
};

/** 西洋占星的出生資料:同上,年份限星曆範圍。 */
export const ASTROLOGY_BIRTH_FIELDS: Fields = { ...WESTERN_BIRTH_FIELDS, year: XALEN_YEAR };

/** BirthPlace 的時區 → 出生當下的 UTC 偏移(含夏令時間),交給 XALEN。 */
export function toWesternRequest(v: Record<string, unknown>): WesternRequest {
  const p = toPlace(v.place);
  const [year, month, day, hour, minute] = [v.year, v.month, v.day, v.hour, v.minute] as number[];
  return { year, month, day, hour, minute, tzOffsetHours: utcOffsetAt(p.zone, year, month, day, hour, minute), lat: p.lat, lon: p.lon };
}

/**
 * 舊前端(AstrologyTool、VedicTool)送的出生資料:固定 UTC 偏移 + 經緯度。
 * 只給 /api/astrology*、/api/vedic 用;前端改送 BirthPlace 後連同這組刪除。
 */
export const LEGACY_WESTERN_FIELDS: Fields = {
  year: BIRTH_FIELDS.year,
  month: BIRTH_FIELDS.month,
  day: WESTERN_BIRTH_FIELDS.day,
  ...CLOCK,
  tzOffsetHours: { type: 'number', min: -12, max: 14, doc: t('UTC 偏移(小時)', 'UTC offset (hours)') },
  lat: { type: 'number', min: -90, max: 90, doc: t('緯度', 'Latitude') },
  lon: { type: 'number', min: -180, max: 180, doc: t('經度', 'Longitude') },
};

export const legacyWesternErrors = (v: Record<string, unknown>, path = ''): string[] =>
  isRealDate(v.year as number, v.month as number, v.day as number) ? [] : [`${path ? `${path}.` : ''}day: no such date`];

export const toLegacyWestern = (v: Record<string, unknown>): WesternRequest => ({
  year: v.year as number,
  month: v.month as number,
  day: v.day as number,
  hour: v.hour as number,
  minute: v.minute as number,
  tzOffsetHours: v.tzOffsetHours as number,
  lat: v.lat as number,
  lon: v.lon as number,
});

/** 規格範例共用的出生資料(台北,國曆 2000-08-16 14:30)。 */
export const EXAMPLE_BIRTH: Record<string, unknown> = {
  calendar: 'solar',
  year: 2000,
  month: 8,
  day: 16,
  hour: 14,
  minute: 30,
  gender: '女',
  place: { label: 'Taipei', lat: 25.03, lon: 121.5, zone: 'Asia/Taipei' },
  trueSolar: true,
};

export const EXAMPLE_WESTERN_BIRTH: Record<string, unknown> = {
  year: 1990,
  month: 7,
  day: 1,
  hour: 23,
  minute: 30,
  place: { label: 'Paris', lat: 48.86, lon: 2.35, zone: 'Europe/Paris' },
};

const LEGACY_ASTROLOGY_FIELDS: Fields = { ...LEGACY_WESTERN_FIELDS, year: XALEN_YEAR };
const LEGACY_BIRTH_OBJECT: FieldSpec = { type: 'object', fields: LEGACY_ASTROLOGY_FIELDS, doc: t('出生資料', 'Birth data') };
const LEGACY_EXAMPLE = { year: 1990, month: 7, day: 1, hour: 23, minute: 30, tzOffsetHours: 2, lat: 48.86, lon: 2.35 };

/** /api/vedic 的 body(舊前端格式)。 */
export const LEGACY_WESTERN_INPUT: InputSpec<WesternRequest> = {
  fields: LEGACY_WESTERN_FIELDS,
  check: (v) => legacyWesternErrors(v),
  build: toLegacyWestern,
  example: LEGACY_EXAMPLE,
};

/** /api/astrology 的 body(舊前端格式;年份限星曆範圍)。 */
export const LEGACY_ASTROLOGY_INPUT: InputSpec<WesternRequest> = { ...LEGACY_WESTERN_INPUT, fields: LEGACY_ASTROLOGY_FIELDS };

/** /api/astrology/transits 的 body。 */
export const LEGACY_TRANSITS_INPUT: InputSpec<{ birth: WesternRequest; today: Ymd; viewerTzOffsetHours: number }> = {
  fields: {
    birth: LEGACY_BIRTH_OBJECT,
    today: DATE('行運日期(使用者的今天)', 'Transit date (the user\'s today)'),
    viewerTzOffsetHours: { type: 'number', min: -12, max: 14, doc: t('使用者所在地 UTC 偏移', 'Viewer UTC offset') },
  },
  check: (v) => {
    const errors = legacyWesternErrors(v.birth as Record<string, unknown>, 'birth');
    if (errors.length) return errors;
    const b = v.birth as Record<string, number>;
    const d = v.today as Record<string, number>;
    if (d.year < XALEN_YEAR_MIN || d.year > XALEN_YEAR_MAX) return [`today.year: must be ${XALEN_YEAR_MIN}..${XALEN_YEAR_MAX}`];
    const ymd = (x: Record<string, number>) => x.year * 10000 + x.month * 100 + x.day;
    return ymd(d) < ymd(b) ? ['today: before birth'] : [];
  },
  build: (v) => ({
    birth: toLegacyWestern(v.birth as Record<string, unknown>),
    today: toYmd(v.today),
    viewerTzOffsetHours: v.viewerTzOffsetHours as number,
  }),
  example: { birth: LEGACY_EXAMPLE, today: { year: 2026, month: 11, day: 21 }, viewerTzOffsetHours: 1 },
};

/** /api/astrology/synastry 的 body。 */
export const LEGACY_SYNASTRY_INPUT: InputSpec<{ a: WesternRequest; b: WesternRequest }> = {
  fields: { a: LEGACY_BIRTH_OBJECT, b: LEGACY_BIRTH_OBJECT },
  check: (v) => [
    ...legacyWesternErrors(v.a as Record<string, unknown>, 'a'),
    ...legacyWesternErrors(v.b as Record<string, unknown>, 'b'),
  ],
  build: (v) => ({ a: toLegacyWestern(v.a as Record<string, unknown>), b: toLegacyWestern(v.b as Record<string, unknown>) }),
  example: { a: LEGACY_EXAMPLE, b: { ...LEGACY_EXAMPLE, year: 1992 } },
};
