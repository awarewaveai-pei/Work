import type { Locale } from './i18n/config';

/**
 * lunar-javascript 只輸出簡體 —— 全站唯一的簡→繁逐字表。
 *
 * 只收「本站會顯示的詞」裡繁簡相異的字(十神/生肖/十二長生/納音、擇日的事項詞、
 *   建除十二值、十二天神、黃道黑道、農曆月日名);不是通用轉換器。
 *   一字多繁(谷/穀、种/種)不收,所以節氣名留在 lib/qimen/ju.ts 的整詞表。
 * 新顯示一類詞:先把該類完整名單加進 s2t.test.ts,紅的字才補進這張表。
 */
const S2T: Record<string, string> = {
  // 十神 / 生肖 / 十二長生 / 納音
  财: '財', 伤: '傷', 杀: '殺', 龙: '龍', 马: '馬', 鸡: '雞', 猪: '豬',
  长: '長', 带: '帶', 临: '臨', 养: '養', 绝: '絕',
  涧: '澗', 炉: '爐', 杨: '楊', 剑: '劍', 锋: '鋒', 头: '頭', 蜡: '蠟', 雳: '靂',
  灯: '燈', 驿: '驛', 钗: '釵', 钏: '釧',
  // 擇日:事項詞、建除、天神、黃黑道、農曆月日
  开: '開', 动: '動', 诸: '諸', 闭: '閉', 满: '滿', 执: '執',
  匮: '匱', 陈: '陳', 黄: '黃', 腊: '臘', 闰: '閏',
};

/** 逐字簡→繁(無對應的字原樣保留)。 */
export function toTraditional(value: string): string {
  return [...value].map((ch) => S2T[ch] ?? ch).join('');
}

// zh-CN(尚未上線)passthrough 簡體;其餘正規化為繁中。
// cast 以容納未來新增的 locale,避免目前 union 不含 zh-CN 的型別誤判。
function isSimplified(locale: Locale): boolean {
  return (locale as string).startsWith('zh-CN');
}

/** 依顯示語言正規化 lunar-javascript 的輸出用字。 */
export function localize(value: string, locale: Locale): string {
  return isSimplified(locale) ? value : toTraditional(value);
}
