import type { MetadataRoute } from 'next';
import { notFound } from 'next/navigation';
import { hasFrontPages } from '@/lib/frontPages';
import { locales } from '@/lib/i18n/config';
import { PAGE_SLUGS, SITE_URL } from '@/lib/site';

const PAGES = ['', ...PAGE_SLUGS] as const;

/** ORACLE_FRONT_PAGES 是執行期變數 → 每次請求判斷,不在 build 時定死。 */
export const dynamic = 'force-dynamic';

/** 多語 sitemap + hreflang alternates → 各語言頁分別被各國搜尋引擎收錄。 */
export default function sitemap(): MetadataRoute.Sitemap {
  // 站前面有 WordPress:sitemap 由 WordPress 出(ORACLE-WP-SPEC §2-12)
  if (hasFrontPages()) notFound();
  const path = (locale: string, page: string) =>
    `${SITE_URL}/${locale}${page ? `/${page}` : ''}`;

  const entries: MetadataRoute.Sitemap = [];
  for (const locale of locales) {
    for (const page of PAGES) {
      entries.push({
        url: path(locale, page),
        changeFrequency: 'weekly',
        priority: page === '' ? 1 : 0.8,
        alternates: {
          languages: Object.fromEntries(locales.map((l) => [l, path(l, page)])),
        },
      });
    }
  }
  return entries;
}
