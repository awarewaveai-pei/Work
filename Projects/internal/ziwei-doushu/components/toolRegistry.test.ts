import { describe, expect, it } from 'vitest';
import { PAGE_SLUGS } from '@/lib/site';
import { TOOL_COMPONENTS, resolveToolRoute } from './toolRegistry';

describe('TOOL_COMPONENTS', () => {
  it('涵蓋 PAGE_SLUGS 全部且沒有多的', () => {
    expect(Object.keys(TOOL_COMPONENTS).sort()).toEqual([...PAGE_SLUGS].sort());
    for (const slug of PAGE_SLUGS) expect(typeof TOOL_COMPONENTS[slug]).toBe('function');
  });
});

describe('resolveToolRoute', () => {
  it('合法語言＋slug 回傳', () => {
    expect(resolveToolRoute('zh-TW', 'ziwei')).toEqual({ locale: 'zh-TW', slug: 'ziwei' });
    expect(resolveToolRoute('en', 'tarot')).toEqual({ locale: 'en', slug: 'tarot' });
  });
  it.each([
    ['zh-TW', 'nope'],
    ['fr', 'ziwei'],
    ['zh-TW', 'toString'],
    ['zh-TW', ''],
  ])('不合法 %s/%s → null(頁面 notFound)', (lang, slug) => {
    expect(resolveToolRoute(lang, slug)).toBeNull();
  });
});
