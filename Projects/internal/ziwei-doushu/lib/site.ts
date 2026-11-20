/**
 * 站台層級設定。SITE_URL 供 metadata/sitemap/robots 使用。
 * 預設子網域(PLAN §14);正式網域確定後設 NEXT_PUBLIC_SITE_URL 覆蓋。
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ziwei.aware-wave.com';

/**
 * 站上各頁 slug 與順序 —— 導覽列、首頁卡片、sitemap 的唯一來源。
 * daily、astrology 是頁面;註冊系統清單另在 lib/divination/types.ts SYSTEM_IDS。
 * 加一頁:此處一項 + app/[lang]/<slug>/page.tsx + messages 的 nav.<slug>(lib/site.test.ts 檢查)
 *   + 首頁的 glyph/desc(漏了 tsc 紅)。
 */
export const PAGE_SLUGS = ['ziwei', 'bazi', 'hehun', 'iching', 'tarot', 'qian', 'astrology', 'fengshui', 'qimen', 'daily'] as const;
export type PageSlug = (typeof PAGE_SLUGS)[number];
