import type { Locale } from '@/lib/i18n/config';
import { isTimeZone } from '@/lib/timezone';

/**
 * 系統輸入規格:每個命理系統宣告一次,驗證(parseInput)、REST v1 與對外文件(describeSpec)都由它產生。
 * 不用驗證套件:欄位型別只有下列幾種,自己寫比引依賴清楚。
 */

export type Text = Record<Locale, string>;

interface Base {
  doc: Text;
  /** 預設 true */
  required?: boolean;
}

export type FieldSpec =
  | (Base & { type: 'integer'; min: number; max: number })
  | (Base & { type: 'number'; min: number; max: number })
  | (Base & { type: 'string'; maxLength: number })
  | (Base & { type: 'enum'; values: readonly string[] })
  | (Base & { type: 'boolean' })
  /** IANA 時區名(Asia/Taipei、Europe/Paris…),以執行環境的 Intl 驗證 */
  | (Base & { type: 'timeZone' })
  /** 國曆日期 {year, month, day},拒絕不存在的日期(2/30) */
  | (Base & { type: 'date' })
  | (Base & { type: 'object'; fields: Fields })
  | (Base & { type: 'array'; items: FieldSpec; minItems: number; maxItems: number });

export type Fields = Readonly<Record<string, FieldSpec>>;

export interface InputSpec<T> {
  fields: Fields;
  /** 跨欄位規則(如模式決定哪些欄位必填);回傳「路徑: 訊息」清單 */
  check?: (v: Record<string, unknown>) => string[];
  /** 驗證過的原始物件 → 系統的輸入型別 */
  build: (v: Record<string, unknown>) => T;
  /** 對外文件的範例輸入;測試會用它實際呼叫一次 */
  example: Record<string, unknown>;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export const YEAR_MIN = 1800;
export const YEAR_MAX = 2200;

export function isRealDate(year: number, month: number, day: number): boolean {
  const t = new Date(Date.UTC(year, month - 1, day));
  return t.getUTCFullYear() === year && t.getUTCMonth() === month - 1 && t.getUTCDate() === day;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function checkField(spec: FieldSpec, v: unknown, path: string, errors: string[]): void {
  switch (spec.type) {
    case 'integer':
    case 'number': {
      const okType = typeof v === 'number' && Number.isFinite(v) && (spec.type === 'number' || Number.isInteger(v));
      if (!okType) errors.push(`${path}: must be ${spec.type === 'integer' ? 'an integer' : 'a number'}`);
      else if ((v as number) < spec.min || (v as number) > spec.max) errors.push(`${path}: must be ${spec.min}..${spec.max}`);
      return;
    }
    case 'string':
      if (typeof v !== 'string') errors.push(`${path}: must be a string`);
      else if (v.length > spec.maxLength) errors.push(`${path}: at most ${spec.maxLength} characters`);
      return;
    case 'enum':
      if (typeof v !== 'string' || !spec.values.includes(v)) errors.push(`${path}: must be one of ${spec.values.join(', ')}`);
      return;
    case 'boolean':
      if (typeof v !== 'boolean') errors.push(`${path}: must be true or false`);
      return;
    case 'timeZone':
      if (typeof v !== 'string' || v.length > 64 || !isTimeZone(v)) errors.push(`${path}: unknown IANA time zone`);
      return;
    case 'date': {
      if (!isObj(v)) {
        errors.push(`${path}: must be {year, month, day}`);
        return;
      }
      const before = errors.length;
      checkObject(DATE_FIELDS, v, path, errors);
      if (errors.length === before && !isRealDate(v.year as number, v.month as number, v.day as number)) {
        errors.push(`${path}: no such date`);
      }
      return;
    }
    case 'object':
      if (!isObj(v)) errors.push(`${path}: must be an object`);
      else checkObject(spec.fields, v, path, errors);
      return;
    case 'array':
      if (!Array.isArray(v)) {
        errors.push(`${path}: must be an array`);
        return;
      }
      if (v.length < spec.minItems || v.length > spec.maxItems) {
        errors.push(`${path}: ${spec.minItems === spec.maxItems ? `exactly ${spec.minItems}` : `${spec.minItems}..${spec.maxItems}`} items`);
      }
      v.forEach((item, i) => checkField(spec.items, item, `${path}[${i}]`, errors));
  }
}

function checkObject(fields: Fields, v: Record<string, unknown>, path: string, errors: string[]): void {
  const at = (k: string) => (path ? `${path}.${k}` : k);
  for (const k of Object.keys(v)) {
    if (!(k in fields)) errors.push(`${at(k)}: unknown field`);
  }
  for (const [k, spec] of Object.entries(fields)) {
    if (v[k] === undefined) {
      if (spec.required !== false) errors.push(`${at(k)}: required`);
      continue;
    }
    checkField(spec, v[k], at(k), errors);
  }
}

const DATE_FIELDS: Fields = {
  year: { type: 'integer', min: YEAR_MIN, max: YEAR_MAX, doc: { 'zh-TW': '年', en: 'Year' } },
  month: { type: 'integer', min: 1, max: 12, doc: { 'zh-TW': '月', en: 'Month' } },
  day: { type: 'integer', min: 1, max: 31, doc: { 'zh-TW': '日', en: 'Day' } },
};

/** 驗證 body;通過才跑 check 與 build。多餘欄位一律拒絕(打錯欄位名不會被默默忽略)。 */
export function parseInput<T>(spec: InputSpec<T>, body: unknown): ParseResult<T> {
  if (!isObj(body)) return { ok: false, errors: ['input: must be an object'] };
  const errors: string[] = [];
  checkObject(spec.fields, body, '', errors);
  if (errors.length === 0 && spec.check) errors.push(...spec.check(body));
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: spec.build(body) };
}

/** 對外文件:去掉函式,只留欄位宣告與範例(純 JSON)。 */
export function describeSpec(spec: InputSpec<unknown>): { fields: Fields; example: Record<string, unknown> } {
  return { fields: spec.fields, example: spec.example };
}
