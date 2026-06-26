import type { MetadataRoute } from 'next';
import { locales } from '@/lib/i18n/config';
import { SITE_URL } from '@/lib/site';

const PAGES = ['', 'ziwei', 'bazi', 'iching', 'tarot', 'astrology', 'daily'] as const;

/** 多語 sitemap + hreflang alternates → 各語言頁分別被各國搜尋引擎收錄。 */
export default function sitemap(): MetadataRoute.Sitemap {
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
