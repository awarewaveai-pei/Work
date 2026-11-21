import { describe, it, expect } from 'vitest';
import { Solar } from 'lunar-javascript';
import ref from './fixtures/hko-solar-terms.json';

/**
 * 外部基準:香港天文台公布的 24 節氣時刻(香港時間 UTC+8,精確到分;出處與取得日期在 fixture)。
 * 本站節氣一律來自 lunar-javascript(北京時間 UTC+8),測它與天文台相差 < 2 分鐘。
 */
/** types/lunar-javascript.d.ts 未宣告節氣表;本測試只用到這幾個方法,在此就地描述。 */
interface JieQiSolar {
  getYear(): number;
  getMonth(): number;
  getDay(): number;
  getHour(): number;
  getMinute(): number;
  getSecond(): number;
  toYmdHms(): string;
}
const jieQiTable = (y: number, m: number, d: number) =>
  (Solar.fromYmd(y, m, d).getLunar() as unknown as { getJieQiTable(): Record<string, JieQiSolar> }).getJieQiTable();

const minutesOf = (s: JieQiSolar) =>
  Date.UTC(s.getYear(), s.getMonth() - 1, s.getDay(), s.getHour(), s.getMinute(), s.getSecond()) / 60000;

describe('節氣時刻 vs 香港天文台', () => {
  for (const [year, terms] of Object.entries(ref.years)) {
    it(`${year} 年 24 節氣`, () => {
      expect(terms).toHaveLength(24);
      for (const t of terms) {
        // 該日所屬農曆年的節氣表,找出落在同一天的那一個
        const table = jieQiTable(Number(year), t.month, t.day);
        const hit = Object.values(table).find(
          (s) => s.getYear() === Number(year) && s.getMonth() === t.month && s.getDay() === t.day,
        );
        expect(hit, `${year} ${t.term} 當天 lunar-javascript 無節氣`).toBeDefined();
        const ours = minutesOf(hit!);
        const hko = Date.UTC(Number(year), t.month - 1, t.day, t.hour, t.minute) / 60000;
        expect(Math.abs(ours - hko), `${year} ${t.term}: 本站 ${hit!.toYmdHms()} vs 天文台 ${t.hour}:${t.minute}`).toBeLessThan(2);
      }
    });
  }
});
