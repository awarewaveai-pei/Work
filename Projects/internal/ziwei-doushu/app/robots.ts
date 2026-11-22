import type { MetadataRoute } from 'next';
import { notFound } from 'next/navigation';
import { hasFrontPages } from '@/lib/frontPages';
import { SITE_URL } from '@/lib/site';

/** ORACLE_FRONT_PAGES 是執行期變數 → 每次請求判斷,不在 build 時定死。 */
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  // 站前面有 WordPress:robots 由 WordPress 出(ORACLE-WP-SPEC §2-12)
  if (hasFrontPages()) notFound();
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
