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
  }

  export class Lunar {
    getEightChar(): EightChar;
    getYearShengXiao(): string;
    getDayGan(): string;
    getDayZhi(): string;
    getDayInGanZhi(): string;
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
  }
}
