import { describe, expect, it } from 'vitest';
import { locales } from '@/lib/i18n/config';
import { PAGE_SLUGS } from '@/lib/site';
import { frontHomeFor, frontPageFor, frontRedirectFor, hasFrontPages, parseFrontPages } from './frontPages';

const VALID = {
  ORACLE_FRONT_PAGES: JSON.stringify({
    pages: { 'zh-TW': '/tools/{slug}/', en: '/english/{slug}/' },
    home: { 'zh-TW': '/', en: '/english/' },
  }),
};
const withPages = (pages: unknown) => ({ ORACLE_FRONT_PAGES: JSON.stringify({ pages }) });

describe('ORACLE_FRONT_PAGES', () => {
  it('合法設定:12 個工具 × 2 語言都得到樣式路徑', () => {
    const expected = { 'zh-TW': (s: string) => `/tools/${s}/`, en: (s: string) => `/english/${s}/` };
    expect(PAGE_SLUGS).toHaveLength(12);
    for (const locale of locales) {
      for (const slug of PAGE_SLUGS) expect(frontPageFor(locale, slug, VALID)).toBe(expected[locale](slug));
      expect(frontHomeFor(locale, VALID)).toBe(locale === 'en' ? '/english/' : '/');
    }
    expect(hasFrontPages(VALID)).toBe(true);
  });

  it.each([
    ['https://evil.example/{slug}'],
    ['//x/{slug}'],
    ['/no-slug/'],
  ])('不合法樣式 %s ＝ 整個視為未設定', (pattern) => {
    const env = withPages({ 'zh-TW': pattern, en: '/english/{slug}/' });
    expect(frontPageFor('zh-TW', 'ziwei', env)).toBeNull();
    expect(frontPageFor('en', 'ziwei', env)).toBeNull();
    expect(hasFrontPages(env)).toBe(false);
    expect(parseFrontPages(env.ORACLE_FRONT_PAGES).error).not.toContain(pattern);
  });

  // 不變量:任何最終路徑都不能落在引擎佔用的前綴,否則轉回引擎 → 無限轉向
  it.each([
    ['/{slug}/', 'tarot 代入後 = /tarot/(§2-1 歸引擎)'],
    ['/x/../zh-TW/{slug}/', '點段正規化後回到 /zh-TW/'],
    ['/%2e%2e/zh-TW/{slug}/', '編碼點段'],
    ['/embed/{slug}/', '引擎前綴'],
  ])('會轉回引擎的樣式 %s(%s)＝ 整個視為未設定', (pattern) => {
    expect(hasFrontPages(withPages({ 'zh-TW': pattern }))).toBe(false);
  });

  it('home 也守同一條不變量', () => {
    const env = (home: unknown) => ({ ORACLE_FRONT_PAGES: JSON.stringify({ pages: { en: '/english/{slug}/' }, home }) });
    expect(hasFrontPages(env({ en: '/en/' }))).toBe(false);
    expect(hasFrontPages(env({ en: '/x/../en' }))).toBe(false);
    expect(frontHomeFor('en', env({ en: '/english/' }))).toBe('/english/');
  });

  it('未設定 ＝ null', () => {
    expect(frontPageFor('zh-TW', 'ziwei', {})).toBeNull();
    expect(frontHomeFor('zh-TW', {})).toBeNull();
    expect(hasFrontPages({})).toBe(false);
  });

  it('轉向只認 /<語言> 與 /<語言>/<工具>(可帶結尾斜線)', () => {
    expect(frontRedirectFor('/zh-TW/ziwei', VALID)).toBe('/tools/ziwei/');
    expect(frontRedirectFor('/zh-TW/%7Aiwei', VALID)).toBe('/tools/ziwei/');
    expect(frontRedirectFor('/zh-TW/%E0', VALID)).toBeNull();
    expect(frontRedirectFor('/en/tarot/', VALID)).toBe('/english/tarot/');
    expect(frontRedirectFor('/en', VALID)).toBe('/english/');
    expect(frontRedirectFor('/embed/zh-TW/ziwei', VALID)).toBeNull();
    expect(frontRedirectFor('/zh-TW/unknown', VALID)).toBeNull();
  });
});
