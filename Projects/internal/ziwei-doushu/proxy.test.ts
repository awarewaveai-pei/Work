import { describe, expect, it } from 'vitest';
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp';
import nextConfig from './next.config';
import { config } from './proxy';

/**
 * 不變量:每個 HTML 回應恰好被一個 CSP 來源涵蓋。
 *   頁面 CSP = proxy.ts(config.matcher);API CSP = next.config.ts headers() 內含 CSP 的 source。
 *   兩邊各寫各的;這裡用 Next 同一套樣式語法(path-to-regexp)判斷歸屬。
 */
const proxyRules = config.matcher.map((m) => pathToRegexp(m));
const headerRules = (await nextConfig.headers!())
  .filter((h) => h.headers.some((x) => x.key === 'Content-Security-Policy'))
  .map((h) => pathToRegexp(h.source));

const byProxy = (p: string) => proxyRules.some((r) => r.test(p));
const byApiHeader = (p: string) => headerRules.some((r) => r.test(p));

describe('CSP 範圍互補', () => {
  it.each(['/', '/zh-TW', '/zh-TW/ziwei', '/embed/en/tarot', '/sitemap.xml', '/no/such/page'])(
    '頁面 %s 只被 proxy 涵蓋',
    (p) => {
      expect([byProxy(p), byApiHeader(p)]).toEqual([true, false]);
    },
  );

  it.each(['/api/v1/systems', '/api/interpret', '/api/mcp'])('API %s 只被 next.config 涵蓋', (p) => {
    expect([byProxy(p), byApiHeader(p)]).toEqual([false, true]);
  });

  it('/_next/static 與 /_next/image 是 build 產物:兩邊都不涵蓋', () => {
    for (const p of ['/_next/static/x.js', '/_next/image']) expect([p, byProxy(p), byApiHeader(p)]).toEqual([p, false, false]);
  });
});
