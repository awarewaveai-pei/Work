/**
 * 站台層級設定。SITE_URL 供 metadata/sitemap/robots 使用。
 * 預設值就是正式網域:NEXT_PUBLIC_* 在 `next build` 時內嵌,compose 的 environment 只在執行期,
 *   蓋不到已建好的 sitemap/metadata(2026-11-20:線上 sitemap 全指向不存在的 ziwei.aware-wave.com)。
 *   換網域(買斷、另站)= build 時給 NEXT_PUBLIC_SITE_URL。
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://oracle.aware-wave.com';

/**
 * 站上各頁 slug 與順序 —— 導覽列、首頁卡片、sitemap 的唯一來源。
 * daily、astrology 是頁面;註冊系統清單另在 lib/divination/types.ts SYSTEM_IDS。
 * 加一頁:此處一項 + app/[lang]/<slug>/page.tsx + messages 的 nav.<slug>(lib/site.test.ts 檢查)
 *   + 首頁的 glyph/desc(漏了 tsc 紅)。
 */
export const PAGE_SLUGS = ['ziwei', 'bazi', 'hehun', 'iching', 'tarot', 'qian', 'astrology', 'vedic', 'fengshui', 'qimen', 'zeri', 'daily'] as const;
export type PageSlug = (typeof PAGE_SLUGS)[number];
