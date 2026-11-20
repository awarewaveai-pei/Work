import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import zhTW from '@/messages/zh-TW.json';
import { PAGE_SLUGS } from './site';

describe('PAGE_SLUGS', () => {
  it.each(PAGE_SLUGS)('%s 有頁面檔與兩語 nav 字串', (slug) => {
    expect(existsSync(join(process.cwd(), 'app', '[lang]', slug, 'page.tsx'))).toBe(true);
    expect((zhTW.nav as Record<string, string>)[slug]).toBeTruthy();
    expect((en.nav as Record<string, string>)[slug]).toBeTruthy();
  });
});
