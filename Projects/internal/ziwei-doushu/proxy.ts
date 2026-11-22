import { NextResponse, type NextRequest } from 'next/server';
import { locales, defaultLocale } from '@/lib/i18n/config';
import { frontRedirectFor } from '@/lib/frontPages';
import { newNonce, pageCsp } from '@/lib/http/csp';

/**
 * Proxy (Next.js 16 — 即舊稱 middleware,16 版改名 `proxy`)。
 * 職責:
 *   1. 對缺 locale 前綴的請求,依 Accept-Language 推測語言後 308 導向 `/[locale]/...`。已含 locale 前綴者放行;
 *      但站前面有 WordPress(ORACLE_FRONT_PAGES)時,`/<語言>`、`/<語言>/<工具>` 308 轉到對應的 WordPress 頁
 *      (同網域相對路徑,保留查詢字串)。只對頁面路徑做(見 isLocalePath)。
 *   2. 其餘回應一律帶頁面 CSP(lib/http/csp.ts),nonce 逐請求產生;Next 從請求的 CSP 標頭取出 nonce 套到
 *      框架腳本上(node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md),所以兩個 root layout
 *      以 connection() 改為逐請求渲染。/api/* 不經這裡,其 CSP 在 next.config.ts。
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

/** 走語言／WordPress 轉向的頁面路徑:不含 _next、api、embed/ 開頭與帶副檔名者(原 matcher 的範圍)。 */
function isLocalePath(pathname: string): boolean {
  return !/^\/(?:_next|api|embed\/)/.test(pathname) && !pathname.includes('.');
}

function withCsp(request: NextRequest) {
  const nonce = newNonce();
  const csp = pageCsp(nonce, process.env.NODE_ENV === 'development');
  const headers = new Headers(request.headers);
  headers.set('Content-Security-Policy', csp);
  // 給伺服端元件 `(await headers()).get('x-nonce')` 用;set 會蓋掉訪客自帶的同名標頭。
  headers.set('x-nonce', nonce);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isLocalePath(pathname)) return withCsp(request);

  const front = frontRedirectFor(pathname);
  if (front) {
    // 用一般 URL 而非 nextUrl.clone():後者改 pathname 會依 trailingSlash 設定吃掉 WordPress 樣式的結尾斜線。
    // 同主機的轉向由 Next 改寫成相對 Location(next/dist/server/web/adapter.js getRelativeURL)。
    const url = new URL(front, request.url);
    url.search = request.nextUrl.search;
    return NextResponse.redirect(url, 308);
  }

  const hasLocale = locales.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`),
  );
  if (hasLocale) return withCsp(request);

  const locale = negotiateLocale(request);
  request.nextUrl.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  // 除了 API(CSP 在 next.config.ts)與建置產物(JS/CSS/圖,非 HTML)外全部經過,404 頁也帶 CSP。
  matcher: ['/((?!api(?:/|$)|_next/static/|_next/image).*)'],
};
