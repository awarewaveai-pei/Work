import type { Locale } from './i18n/config';
import { QIAN_LOTS, type QianGrade, type QianLot } from './qian/data';

/**
 * 求籤 — 觀音靈籤一百首。均勻抽一支(1–100);籤詩資料與出處見 lib/qian/data.ts。
 * 解說由 AI 層依籤詩與主題敘事,本模組只負責抽籤與標籤文字。
 */

export type { QianGrade, QianLot };
export { QIAN_LOTS };

export type QianTopic = 'general' | 'love' | 'career' | 'wealth' | 'health' | 'travel';

export const QIAN_TOPICS: Record<QianTopic, Record<Locale, string>> = {
  general: { 'zh-TW': '綜合', en: 'General' },
  love: { 'zh-TW': '感情', en: 'Love' },
  career: { 'zh-TW': '事業', en: 'Career' },
  wealth: { 'zh-TW': '財運', en: 'Wealth' },
  health: { 'zh-TW': '健康', en: 'Health' },
  travel: { 'zh-TW': '出行', en: 'Travel' },
};

export const QIAN_GRADES: Record<QianGrade, Record<Locale, string>> = {
  upper: { 'zh-TW': '上籤', en: 'Upper lot' },
  middle: { 'zh-TW': '中籤', en: 'Middle lot' },
  lower: { 'zh-TW': '下籤', en: 'Lower lot' },
};

/** 均勻抽一支籤。rng 預設 Math.random,須回傳 [0, 1)。 */
export function drawQian(rng: () => number = Math.random): QianLot {
  return QIAN_LOTS[Math.floor(rng() * QIAN_LOTS.length)];
}
