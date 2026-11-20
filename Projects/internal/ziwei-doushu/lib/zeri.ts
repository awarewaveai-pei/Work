import { Solar } from 'lunar-javascript';
import { animalOf } from './hehun';
import { yearGanZhi } from './liChun';
import { toTraditional } from './s2t';

/**
 * 擇日(日課,不擇時辰)— 純函式。宜忌、建除、天神、沖取自 lunar-javascript 通書資料。
 *
 * 判定規則(固定一種,改規則 = 改這裡與 zeri.test.ts):
 * - avoid:當日「忌」含該事項(含「諸事不宜」),或日沖居住者生肖。
 * - good :不犯 avoid,且「宜」含該事項,且為黃道日。
 * - ok   :其餘。
 * 居住者生肖:birthYear 視為立春年,年支由 lib/liChun.ts yearGanZhi 取。
 */

export type ZeriActivity = 'ruZhai' | 'banJia' | 'kaiShi' | 'dongTu' | 'jiaQu' | 'chuXing' | 'qianYue' | 'anChuang';
export const ZERI_ACTIVITIES: readonly ZeriActivity[] = [
  'ruZhai', 'banJia', 'kaiShi', 'dongTu', 'jiaQu', 'chuXing', 'qianYue', 'anChuang',
];

/** 事項 → 通書宜忌詞(lunar-javascript 原始簡體);任一詞命中即算含該事項。 */
export const ACTIVITY_TERMS: Readonly<Record<ZeriActivity, readonly string[]>> = {
  ruZhai: ['入宅'],
  banJia: ['移徙'],
  kaiShi: ['开市'],
  dongTu: ['动土'],
  jiaQu: ['嫁娶'],
  chuXing: ['出行'],
  qianYue: ['立券', '交易'],
  anChuang: ['安床'],
};

/** 忌含此詞 = 所有事項皆忌 */
const ALL_AVOIDED = '诸事不宜';

export const MAX_RANGE_DAYS = 92;

export interface Ymd {
  year: number;
  month: number;
  day: number;
}

export interface ZeriRequest {
  activity: ZeriActivity;
  from: Ymd;
  to: Ymd;
  /** 居住者出生的立春年 */
  birthYear?: number;
}

export type ZeriVerdict = 'good' | 'ok' | 'avoid';
/** 判定原因(代碼;顯示文字由頁面/系統層依語言給) */
export type ZeriReason = 'jiHit' | 'chongResident' | 'yiHit' | 'yiMissing' | 'huangDao' | 'heiDao';

export interface ZeriDay {
  /** YYYY-MM-DD */
  date: string;
  /** 農曆,如「十月初二」「閏六月十五」 */
  lunarDate: string;
  ganZhi: string;
  /** 建除十二值(繁體) */
  zhiXing: string;
  tianShen: { name: string; huangDao: boolean };
  /** 日沖的地支與生肖 */
  chong: { zhi: string; shengXiao: string };
  yi: boolean;
  ji: boolean;
  verdict: ZeriVerdict;
  reasons: ZeriReason[];
}

export interface ZeriResult {
  activity: ZeriActivity;
  from: string;
  to: string;
  /** 有 birthYear 時:居住者年支與生肖 */
  resident: { zhi: string; shengXiao: string } | null;
  days: ZeriDay[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymdString = (d: Ymd) => `${d.year}-${pad(d.month)}-${pad(d.day)}`;
const DAY_MS = 86_400_000;

function toUtc(d: Ymd): number {
  const t = Date.UTC(d.year, d.month - 1, d.day);
  const back = new Date(t);
  if (back.getUTCFullYear() !== d.year || back.getUTCMonth() !== d.month - 1 || back.getUTCDate() !== d.day) {
    throw new Error(`無效日期: ${ymdString(d)}`);
  }
  return t;
}

export function computeZeri(req: ZeriRequest): ZeriResult {
  const terms = ACTIVITY_TERMS[req.activity];
  if (!terms) throw new Error(`未知事項: ${req.activity}`);
  const start = toUtc(req.from);
  const end = toUtc(req.to);
  if (end < start) throw new Error('結束日早於開始日');
  const count = (end - start) / DAY_MS + 1;
  if (count > MAX_RANGE_DAYS) throw new Error(`區間最長 ${MAX_RANGE_DAYS} 天`);

  const residentZhi = req.birthYear === undefined ? null : yearGanZhi(req.birthYear)[1];
  const has = (list: string[]) => list.some((w) => terms.includes(w));

  const days: ZeriDay[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start + i * DAY_MS);
    const ymd = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    const lunar = Solar.fromYmd(ymd.year, ymd.month, ymd.day).getLunar();

    const yiList = lunar.getDayYi();
    const jiList = lunar.getDayJi();
    const yi = has(yiList);
    const ji = has(jiList) || jiList.includes(ALL_AVOIDED);
    const huangDao = lunar.getDayTianShenType() === '黄道';
    const chongZhi = lunar.getDayChong();
    const chongResident = residentZhi !== null && chongZhi === residentZhi;

    const reasons: ZeriReason[] = [];
    if (ji) reasons.push('jiHit');
    if (chongResident) reasons.push('chongResident');
    reasons.push(yi ? 'yiHit' : 'yiMissing', huangDao ? 'huangDao' : 'heiDao');
    const verdict: ZeriVerdict = ji || chongResident ? 'avoid' : yi && huangDao ? 'good' : 'ok';

    days.push({
      date: ymdString(ymd),
      lunarDate: toTraditional(`${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`),
      ganZhi: lunar.getDayInGanZhi(),
      zhiXing: toTraditional(lunar.getZhiXing()),
      tianShen: { name: toTraditional(lunar.getDayTianShen()), huangDao },
      chong: { zhi: chongZhi, shengXiao: animalOf(chongZhi) },
      yi,
      ji,
      verdict,
      reasons,
    });
  }

  return {
    activity: req.activity,
    from: ymdString(req.from),
    to: ymdString(req.to),
    resident: residentZhi === null ? null : { zhi: residentZhi, shengXiao: animalOf(residentZhi) },
    days,
  };
}
