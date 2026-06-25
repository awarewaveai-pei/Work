/**
 * 站台層級設定。SITE_URL 供 metadata/sitemap/robots 使用。
 * 預設子網域(PLAN §14);正式網域確定後設 NEXT_PUBLIC_SITE_URL 覆蓋。
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ziwei.aware-wave.com';
