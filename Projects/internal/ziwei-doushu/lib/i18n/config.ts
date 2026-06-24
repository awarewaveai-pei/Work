/**
 * i18n 設定 (F2 地基) — 全站語言路由與 locale 對應的單一事實來源。
 *
 * 設計:採 Next.js 16 官方「原生 dictionary」模式(零額外依賴),locale 走
 *   subpath 路由 `/[lang]/...`。新增語言 = 在 locales 補一筆 + 加對應字典檔
 *   (messages/<locale>.json) + 在 LOCALE_TO_IZTRO 補對應 iztro 語言碼。
 *
 * 注意:此檔可在 server 與 client 元件共用(純常數/純函式,無 server-only)。
 *   實際字典載入在 lib/i18n/dictionaries.ts (server-only)。
 */

/** 目前支援的語言(= 有對應字典檔者)。擴語言時連同字典一起加,避免 404。 */
export const locales = ['zh-TW', 'en'] as const;
export type Locale = (typeof locales)[number];

/** 預設語言(主場繁中)。bare `/` 由 proxy 導向此 locale。 */
export const defaultLocale: Locale = 'zh-TW';

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/**
 * locale → iztro 語言碼。
 * ⚠️ iztro 的英文碼是 'en-US';傳 'en' 會回傳 i18n key(如 'pojunMaj')而非英文,
 *    故此對應表為必要(已實測 2026-06-24)。
 */
const LOCALE_TO_IZTRO: Record<Locale, string> = {
  'zh-TW': 'zh-TW',
  en: 'en-US',
};

export function localeToIztroLang(locale: Locale): string {
  return LOCALE_TO_IZTRO[locale] ?? LOCALE_TO_IZTRO[defaultLocale];
}
