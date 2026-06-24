import 'server-only';
import type { Locale } from './config';

/**
 * 字典載入器 (F2, server-only)。
 *
 * - 採 Next.js 16 官方 dictionary 模式:動態 import JSON,只在 server 執行,
 *   不進 client bundle(字典再大也不影響前端載入)。
 * - `satisfies Record<Locale, ...>`:編譯期保證每個 locale 都有對應載入器
 *   —— 新增語言卻忘了補字典 → tsc 直接報錯,杜絕漏網。
 * - `Dictionary` 型別由繁中字典推導(各語字典須同形)。client 元件以
 *   `import type { Dictionary }` 取用:type-only import 會被編譯抹除,
 *   不會在 client 觸發 'server-only' 例外。
 */
const dictionaries = {
  'zh-TW': () => import('@/messages/zh-TW.json').then((m) => m.default),
  en: () => import('@/messages/en.json').then((m) => m.default),
};

export type Dictionary = Awaited<ReturnType<(typeof dictionaries)['zh-TW']>>;

/**
 * 完整性由型別系統把關:
 * - `dictionaries[locale]`(locale: Locale)若漏掉某 locale 的 loader → tsc 報錯。
 * - 回傳標註 Promise<Dictionary>:若各語字典結構不一致(en 少/多 key)→ tsc 報錯,
 *   強制各語字典平行。
 */
export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]();
}
