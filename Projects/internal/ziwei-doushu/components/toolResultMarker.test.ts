import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PAGE_SLUGS, type PageSlug } from '@/lib/site';

/**
 * 外掛父頁腳本靠 `[data-aw-result]` 知道「結果出現了」(取代猜高度);標記只在結果存在時才在 DOM 內,
 * 驗證錯誤訊息不帶。鍵型別 = PageSlug:新增工具沒登記 → tsc 紅。
 */
const FILE: Record<PageSlug, string> = {
  ziwei: 'ZiweiTool', bazi: 'BaziTool', hehun: 'HehunTool', iching: 'IChingTool', tarot: 'TarotTool',
  qian: 'QianTool', astrology: 'AstrologyTool', vedic: 'VedicTool', fengshui: 'FengshuiTool',
  qimen: 'QimenTool', zeri: 'ZeriTool', daily: 'DailyTool',
};

describe('工具結果區標記 data-aw-result', () => {
  it.each(PAGE_SLUGS)('%s 的結果區帶標記,且只在 {結果 ? ( 的條件區塊內', (slug) => {
    const src = readFileSync(new URL(`./${FILE[slug]}.tsx`, import.meta.url), 'utf8');
    const hits = src.match(/data-aw-result/g) ?? [];
    expect(hits).toHaveLength(1);
    // 標記前緊接著的是條件渲染(結果不存在時整段不輸出),不是無條件的外框
    const before = src.slice(0, src.indexOf('data-aw-result'));
    expect(before.slice(-300)).toMatch(/\{(result|lot|chart)\b[^}]*\? (\(|\(\) => \{)/);
  });
});
