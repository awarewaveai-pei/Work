import { NextResponse, type NextRequest } from 'next/server';
import { locales, defaultLocale } from '@/lib/i18n/config';

/**
 * Proxy (Next.js 16 — 即舊稱 middleware,16 版改名 `proxy`)。
 * 職責:對缺 locale 前綴的請求,依 Accept-Language 推測語言後 308 導向
 *   `/[locale]/...`。已含 locale 前綴者放行。
 */
function negotiateLocale(request: NextRequest): string {
  const accept = request.headers.get('accept-language');
  if (!accept) return defaultLocale;
  for (const part of accept.split(',')) {
    const code = part.split(';')[0].trim();
    if (!code) continue;
    // 完全比對 (zh-TW === zh-TW)
    const exact = locales.find((l) => l.toLowerCase() === code.toLowerCase());
    if (exact) return exact;
    // 語言前綴比對 (en-GB → en、zh-HK → zh-TW)
    const prefix = code.split('-')[0].toLowerCase();
    const byPrefix = locales.find((l) => l.split('-')[0].toLowerCase() === prefix);
    if (byPrefix) return byPrefix;
  }
  return defaultLocale;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLocale = locales.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`),
  );
  if (hasLocale) return;

  const locale = negotiateLocale(request);
  request.nextUrl.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  // 略過 _next、api、與帶副檔名的靜態檔(favicon 等)
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
