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
    /** 建除十二值(簡體,如 闭) */
    getZhiXing(): string;
    /** 值日天神(簡體,如 金匮) */
    getDayTianShen(): string;
    /** '黄道' | '黑道'(簡體) */
    getDayTianShenType(): string;
    /** 日沖的地支,如 辰 */
    getDayChong(): string;
    /** 農曆月名(正…冬腊,閏月前綴 闰) */
    getMonthInChinese(): string;
    /** 農曆日名(初一…三十) */
    getDayInChinese(): string;
    /** 以節氣精確時刻換年/月;日以 23:00 換日 */
    getYearInGanZhiExact(): string;
    getMonthInGanZhiExact(): string;
    getDayInGanZhiExact(): string;
    getTimeInGanZhi(): string;
    /** wholeDay=false:精確到秒的上一個節氣(含當下時刻) */
    getPrevJieQi(wholeDay?: boolean): JieQi;
    /** 日九星(玄空) */
    getDayNineStar(): NineStar;
    /** 二十八宿單字(簡體,如 轸) */
    getXiu(): string;
    /** 宿的七政(日月木火土金水) */
    getZheng(): string;
    /** 宿的動物(簡體;胃作「彘」、壁作「獝」,與通行寫法不同) */
    getAnimal(): string;
    /** 宿吉凶:'吉' | '凶' */
    getXiuLuck(): string;
    /** 彭祖百忌(天干句、地支句,簡體) */
    getPengZuGan(): string;
    getPengZuZhi(): string;
    /** 喜神 / 財神 / 福神方位描述(簡體,如 正东);福神 sect 省略 = 流派 2 */
    getDayPositionXiDesc(): string;
    getDayPositionCaiDesc(): string;
    getDayPositionFuDesc(sect?: number): string;
    /** 胎神占方(簡體,如 占门床 外正南) */
    getDayPositionTai(): string;
    /** 日沖的天干 */
    getDayChongGan(): string;
    /** 日沖的生肖(簡體) */
    getDayChongShengXiao(): string;
    /** 日煞方位單字:东 南 西 北(簡體) */
    getDaySha(): string;
    /** 日吉神 / 日凶煞(簡體;無則為 ['无']) */
    getDayJiShen(): string[];
    getDayXiongSha(): string[];
  }

  export class NineStar {
    /** 一…九 */
    getNumber(): string;
    /** 白黑碧绿黄赤紫(簡體) */
    getColor(): string;
    /** 五行 */
    getWuXing(): string;
  }

  export class JieQi {
    /** 簡體節氣名 */
    getName(): string;
    getSolar(): Solar;
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
    getHour(): number;
    getMinute(): number;
  }
}
