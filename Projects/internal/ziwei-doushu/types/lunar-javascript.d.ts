/**
 * lunar-javascript 最小型別宣告(套件本身無 .d.ts)。
 * 僅宣告本專案實際使用的 API;用到新方法時於此擴充。
 */
declare module 'lunar-javascript' {
  export class EightChar {
    getYear(): string;
    getMonth(): string;
    getDay(): string;
    getTime(): string;
    getYearGan(): string;
    getYearZhi(): string;
    getMonthGan(): string;
    getMonthZhi(): string;
    getDayGan(): string;
    getDayZhi(): string;
    getTimeGan(): string;
    getTimeZhi(): string;
    getYearShiShenGan(): string;
    getMonthShiShenGan(): string;
    getTimeShiShenGan(): string;
    getYearShiShenZhi(): string[];
    getMonthShiShenZhi(): string[];
    getDayShiShenZhi(): string[];
    getTimeShiShenZhi(): string[];
    getYearNaYin(): string;
    getMonthNaYin(): string;
    getDayNaYin(): string;
    getTimeNaYin(): string;
    getYearDiShi(): string;
    getMonthDiShi(): string;
    getDayDiShi(): string;
    getTimeDiShi(): string;
    getDayXunKong(): string;
    /** gender: 1 男、0 女 */
    getYun(gender: number): Yun;
  }

  export class Yun {
    isForward(): boolean;
    getStartYear(): number;
    getStartMonth(): number;
    getStartDay(): number;
    /** n 步(含索引 0 的起運前小運) */
    getDaYun(n?: number): DaYun[];
  }

  export class DaYun {
    getIndex(): number;
    getGanZhi(): string;
    getStartAge(): number;
    getEndAge(): number;
    getStartYear(): number;
    getEndYear(): number;
  }

  export class Lunar {
    /** month 為負數 = 閏月 */
    static fromYmdHms(
      year: number,
      month: number,
      day: number,
      hour: number,
      minute: number,
      second: number,
    ): Lunar;
    getSolar(): Solar;
    getEightChar(): EightChar;
    getYearShengXiao(): string;
    getDayGan(): string;
    getDayZhi(): string;
    getDayInGanZhi(): string;
    getYearInGanZhi(): string;
    getYearInGanZhiByLiChun(): string;
    getDayYi(): string[];
    getDayJi(): string[];
  }

  export class Solar {
    static fromYmdHms(
      year: number,
      month: number,
      day: number,
      hour: number,
      minute: number,
      second: number,
    ): Solar;
    static fromYmd(year: number, month: number, day: number): Solar;
    getLunar(): Lunar;
    getYear(): number;
    getMonth(): number;
    getDay(): number;
  }
}
